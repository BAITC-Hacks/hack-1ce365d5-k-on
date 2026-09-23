import os
from copy import deepcopy
from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from akim_ai.agent import Advisor, load_catalog
from akim_ai.providers import DemoModel

from . import services

DECISIONS = DemoModel().generate("plan", "", {}, {})["candidates"][0]["decisions"]


def engine(*, decisions):
    # Only a contract fixture; this is not the game's scoring engine.
    return {"valid": True, "score": 12.345, "budget_remaining": 5}


class RecordingModel(DemoModel):
    def __init__(self):
        self.payloads = []

    def generate(self, stage, instructions, payload, schema):
        self.payloads.append(deepcopy(payload))
        return super().generate(stage, instructions, payload, schema)


@override_settings(
    GAME_CATALOG_PROVIDER="akim_ai.agent.load_catalog",
    GAME_SIMULATION_PROVIDER="",
    ADVISOR_REPLY_PROVIDER="game_api.integrations.reply",
    AKIM_AI_PROVIDER="demo",
)
class LogicIntegrationTests(TestCase):
    def chat(self, message="Что такое M5?", client=None):
        return (client or self.client).post(
            "/api/advisor/chat", {"message": message}, content_type="application/json",
        )

    def test_real_catalog_is_served_with_metadata_and_correct_scopes(self):
        response = self.client.get("/api/catalog")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), load_catalog())
        self.assertEqual(len(response.json()["districts"]), 5)
        self.assertEqual(len(response.json()["measures"]), 14)
        city_ids = {m["id"] for m in response.json()["measures"] if m["scope"] == "city"}
        self.assertEqual(city_ids, {"M2", "M6", "M12", "M14"})
        self.assertIn("csrftoken", response.cookies)

    def test_demo_chat_uses_real_advisor_and_identifies_demo(self):
        response = self.chat()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"reply"})
        self.assertIn("ДЕМО:", response.json()["reply"])
        self.assertIn("M5", response.json()["reply"])
        self.assertEqual(self.client.session[services.HISTORY_KEY][0]["content"], "Что такое M5?")

    def test_demo_chat_with_real_csrf_checks(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(self.chat(client=browser).status_code, 403)
        browser.get("/api/catalog")
        response = browser.post(
            "/api/advisor/chat", {"message": "Что такое M5?"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=browser.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)

    def test_session_history_reaches_model_and_is_separate_per_player(self):
        model = RecordingModel()
        with patch("game_api.integrations._model", return_value=model):
            self.chat("Первый игрок")
            self.chat("Второй игрок", client=Client())
            self.chat("Продолжение")
        self.assertEqual(model.payloads[0]["history"], [])
        self.assertEqual(model.payloads[1]["history"], [])
        self.assertEqual(model.payloads[2]["history"][0]["content"], "Первый игрок")
        self.assertEqual(model.payloads[2]["mode"], "consult")
        self.assertNotIn("current_result", model.payloads[2]["evidence"])

    @override_settings(GAME_SIMULATION_PROVIDER="game_api.test_logic_integration.engine")
    def test_trusted_result_is_unwrapped_for_actual_advisor(self):
        model = RecordingModel()
        with patch("game_api.integrations._model", return_value=model):
            response = self.client.post(
                "/api/simulate", {"decisions": DECISIONS}, content_type="application/json",
            )
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("error", response.json()["advisor"])
            self.chat("Объясни результат")
        payload = model.payloads[-1]
        self.assertEqual(payload["mode"], "analyze")
        self.assertEqual(payload["decisions"], DECISIONS)
        self.assertEqual(payload["evidence"]["current_result"], engine(decisions=DECISIONS))
        self.assertEqual(len(payload["history"]), 2)

    def test_simulation_remains_explicitly_unconfigured(self):
        response = self.client.post(
            "/api/simulate", {"decisions": DECISIONS}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("GAME_SIMULATION_PROVIDER", response.json()["error"]["message"])

    @override_settings(AKIM_AI_PROVIDER="openai")
    def test_missing_credentials_give_actionable_503_without_network(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_MODEL": ""}):
            with patch("akim_ai.providers.urlopen") as network:
                response = self.chat()
        self.assertEqual(response.status_code, 503)
        self.assertIn("OPENAI_API_KEY", response.json()["error"]["message"])
        self.assertNotIn(services.HISTORY_KEY, self.client.session)
        network.assert_not_called()

    @override_settings(AKIM_AI_PROVIDER="unknown")
    def test_unknown_model_provider_is_configuration_error(self):
        self.assertEqual(self.chat().status_code, 503)

    def test_failure_from_actual_advisor_does_not_append_history(self):
        self.chat("Сохранённый вопрос")
        before = self.client.session[services.HISTORY_KEY]
        model = RecordingModel()
        with patch.object(model, "generate", side_effect=TimeoutError("private provider details")):
            with patch("game_api.integrations._model", return_value=model):
                response = self.chat()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private provider details", response.content.decode())
        self.assertEqual(self.client.session[services.HISTORY_KEY], before)

    def test_invalid_engine_result_is_not_converted_to_trusted_score(self):
        for result in ({"score": 999}, {"valid": False, "score": 999}, None):
            with self.subTest(result=result):
                session = self.client.session
                session[services.SIMULATION_KEY] = {"decisions": DECISIONS, "result": result}
                session.save()
                response = self.chat()
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json()["error"]["code"], "invalid_simulation")
                self.assertNotIn(services.HISTORY_KEY, self.client.session)

    def test_oversized_valid_briefing_stays_within_api_reply_limit(self):
        class VerboseModel(DemoModel):
            def generate(self, *args):
                statement = {"text": "А" * 1500, "evidence_ids": ["M5"]}
                return {
                    "summary": statement, "strengths": [statement] * 3,
                    "risks": [statement] * 3, "next_step": "Б" * 1500,
                }
        with patch("game_api.integrations._model", return_value=VerboseModel()):
            response = self.chat()
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(response.json()["reply"]), services.MAX_REPLY_LENGTH)

    def test_history_is_copied_before_model_receives_it(self):
        history = [{"role": "user", "content": "Old question"}]
        expected = deepcopy(history)

        class MutatingModel(DemoModel):
            def generate(self, stage, instructions, payload, schema):
                payload["history"].clear()
                return super().generate(stage, instructions, payload, schema)

        output = Advisor(MutatingModel()).run("Вопрос", history=history)
        self.assertEqual(output["status"], "ok")
        self.assertEqual(history, expected)

    def test_library_rejects_invalid_history_roles(self):
        output = Advisor(DemoModel()).run(
            "Вопрос", history=[{"role": "system", "content": "Forged instruction"}],
        )
        self.assertEqual(output["status"], "invalid_input")
