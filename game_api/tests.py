import json
from copy import deepcopy
from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from . import services
from .errors import SimulationRejected

CATALOG = {
    "districts": [
        {"id": "SARYARKA", "name": "Сарыарка"},
        {"id": "ALMATY", "name": "Алматы"},
    ],
    "measures": [
        {"id": f"M{i}", "name": f"Мера {i}", "cost": i * 100,
         "scope": "city" if i == 4 else "district"}
        for i in range(1, 6)
    ],
}
DECISIONS = [
    {"measure_id": f"M{i}", "district_id": None if i == 4 else "SARYARKA"}
    for i in range(1, 6)
]


# These providers exist only in tests. Runtime settings never select them.
def catalog_provider():
    return deepcopy(CATALOG)


def simulation_provider(*, decisions):
    return {"score": 73, "budget_remaining": 200}


def reply_provider(*, message, history, simulation):
    return "Начните с районных мер."


@override_settings(
    GAME_CATALOG_PROVIDER="game_api.tests.catalog_provider",
    GAME_SIMULATION_PROVIDER="game_api.tests.simulation_provider",
    ADVISOR_REPLY_PROVIDER="game_api.tests.reply_provider",
)
class GameAPITests(TestCase):
    def setUp(self):
        self.engine = self.enterContext(patch(
            "game_api.tests.simulation_provider", autospec=True,
            return_value={"score": 73, "budget_remaining": 200},
        ))
        self.advisor = self.enterContext(patch(
            "game_api.tests.reply_provider", autospec=True,
            return_value="Начните с районных мер.",
        ))

    def post(self, url, data, client=None):
        return (client or self.client).post(url, data, content_type="application/json")

    def simulate(self, client=None, decisions=None):
        return self.post("/api/simulate", {
            "decisions": DECISIONS if decisions is None else decisions,
        }, client)

    def chat(self, message="Как улучшить результат?", client=None):
        return self.post("/api/advisor/chat", {"message": message}, client)

    def test_catalog_preserves_ids_and_sets_csrf_cookie(self):
        response = self.client.get("/api/catalog")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), CATALOG)
        self.assertIn("csrftoken", response.cookies)
        self.assertIn("no-store", response["Cache-Control"])

    def test_simulation_calls_engine_then_advisor_with_server_result(self):
        response = self.simulate()
        self.assertEqual(response.status_code, 200)
        self.engine.assert_called_once_with(decisions=DECISIONS)
        simulation = {"decisions": DECISIONS, "result": self.engine.return_value}
        self.advisor.assert_called_once_with(
            message=services.SIMULATION_PROMPT, history=[], simulation=simulation,
        )
        self.assertEqual(response.json(), {
            "simulation": simulation, "advisor": {"reply": self.advisor.return_value},
        })
        self.assertEqual(self.client.session[services.SIMULATION_KEY], simulation)

    def test_chat_before_simulation_works(self):
        response = self.chat("  Привет  ")
        self.assertEqual(response.status_code, 200)
        self.advisor.assert_called_once_with(message="Привет", history=[], simulation=None)
        self.assertEqual(response.json(), {"reply": self.advisor.return_value})

    def test_followup_uses_saved_history_and_simulation(self):
        self.simulate()
        history = self.client.session[services.HISTORY_KEY]
        simulation = self.client.session[services.SIMULATION_KEY]
        self.advisor.reset_mock()
        self.chat()
        self.advisor.assert_called_once_with(
            message="Как улучшить результат?", history=history, simulation=simulation,
        )
        self.assertEqual(len(self.client.session[services.HISTORY_KEY]), 4)

    def test_players_have_separate_histories_and_results(self):
        other = Client()
        self.simulate()
        self.chat("First player's secret")
        self.chat("Second player", client=other)
        self.assertEqual(self.advisor.call_args.kwargs, {
            "message": "Second player", "history": [], "simulation": None,
        })
        self.engine.return_value = {"score": 12}
        self.simulate(client=other)
        self.chat("Back to first player")
        self.assertEqual(self.advisor.call_args.kwargs["simulation"]["result"]["score"], 73)
        self.assertNotIn("Second player", json.dumps(self.advisor.call_args.kwargs["history"]))
        self.assertNotEqual(self.client.session.session_key, other.session.session_key)

    def test_browser_cookie_restores_session_in_new_client(self):
        self.chat("Remember this")
        restored = Client()
        restored.cookies = self.client.cookies.copy()
        self.chat("Follow up", client=restored)
        self.assertEqual(self.advisor.call_args.kwargs["history"][0]["content"], "Remember this")

    def test_client_cannot_submit_score_simulation_history_or_player_id(self):
        for field in ("score", "Score", "simulation", "history", "session_id", "player_id"):
            with self.subTest(field=field):
                response = self.post("/api/advisor/chat", {"message": "Hello", field: 999})
                self.assertEqual(response.status_code, 400)
        response = self.post("/api/simulate", {"decisions": DECISIONS, "score": 999})
        self.assertEqual(response.status_code, 400)
        self.advisor.assert_not_called()
        self.engine.assert_not_called()

    def test_invalid_messages_do_not_call_advisor(self):
        for message in ("", "  ", None, [], 12, "x" * 4001):
            with self.subTest(message_type=type(message)):
                response = self.chat(message)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"]["code"], "invalid_message")
        self.advisor.assert_not_called()

    def test_decision_count_and_shape(self):
        for decisions in (None, {}, [], DECISIONS[:4], DECISIONS + [DECISIONS[0]], [None] * 5):
            with self.subTest(decisions=decisions):
                self.assertEqual(self.post("/api/simulate", {"decisions": decisions}).status_code, 400)
        self.engine.assert_not_called()

    def test_unknown_ids_wrong_scopes_and_duplicate_pairs(self):
        cases = [
            {"measure_id": "UNKNOWN", "district_id": "SARYARKA"},
            {"measure_id": [], "district_id": "SARYARKA"},
            {"measure_id": "M1", "district_id": "Сарыарка"},
            {"measure_id": "M1", "district_id": None},
            {"measure_id": "M1", "district_id": []},
            {"measure_id": "M4", "district_id": "SARYARKA"},
            {"measure_id": "M1"},
            {"measure_id": "M1", "district_id": "SARYARKA", "cost": 0},
            DECISIONS[1],
        ]
        for replacement in cases:
            with self.subTest(replacement=replacement):
                decisions = deepcopy(DECISIONS)
                decisions[0] = replacement
                self.assertEqual(self.simulate(decisions=decisions).status_code, 400)
        self.engine.assert_not_called()

    def test_same_measure_in_different_districts_is_allowed(self):
        decisions = deepcopy(DECISIONS)
        decisions[1] = {"measure_id": "M1", "district_id": "ALMATY"}
        self.assertEqual(self.simulate(decisions=decisions).status_code, 200)

    def test_invalid_json_and_content_type(self):
        for body in (b"{", b"[]", b"null", b'{"message": NaN}', b"\xff"):
            with self.subTest(body=body):
                response = self.client.post("/api/advisor/chat", body, content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json())
        response = self.client.post("/api/advisor/chat", "hello", content_type="text/plain")
        self.assertEqual(response.status_code, 415)

    def test_large_body_is_rejected(self):
        response = self.chat("x" * (65 * 1024))
        self.assertEqual(response.status_code, 413)
        self.advisor.assert_not_called()

    def test_methods_return_json_and_allow_header(self):
        for path in ("/api/simulate", "/api/advisor/chat"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 405)
            self.assertEqual(response["Allow"], "POST")
            self.assertEqual(response.json()["error"]["code"], "method_not_allowed")
        response = self.post("/api/catalog", {})
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response["Allow"], "GET")

    def test_csrf_required_and_valid_token_accepted(self):
        browser = Client(enforce_csrf_checks=True)
        response = self.chat(client=browser)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        browser.get("/api/catalog")
        token = browser.cookies["csrftoken"].value
        for path, data in (
            ("/api/advisor/chat", {"message": "Hello"}),
            ("/api/simulate", {"decisions": DECISIONS}),
        ):
            response = browser.post(
                path, data, content_type="application/json", HTTP_X_CSRFTOKEN=token,
            )
            self.assertEqual(response.status_code, 200)

    @override_settings(ADVISOR_REPLY_PROVIDER="")
    def test_missing_advisor_is_explicit(self):
        response = self.chat()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "service_unavailable")

    @override_settings(GAME_CATALOG_PROVIDER="")
    def test_catalog_sets_csrf_cookie_even_before_engine_is_connected(self):
        response = self.client.get("/api/catalog")
        self.assertEqual(response.status_code, 503)
        self.assertIn("csrftoken", response.cookies)

    @override_settings(ADVISOR_REPLY_PROVIDER="missing_module.reply")
    def test_broken_provider_import_returns_json(self):
        with self.assertLogs("game_api.services", level="ERROR"):
            response = self.chat()
        self.assertEqual(response.status_code, 503)

    def test_advisor_failure_does_not_save_partial_turn_or_leak_exception(self):
        self.chat("Saved turn")
        before = self.client.session[services.HISTORY_KEY]
        self.advisor.side_effect = RuntimeError("private upstream credential")
        with self.assertLogs("game_api.services", level="ERROR"):
            response = self.chat()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private upstream", response.content.decode())
        self.assertEqual(self.client.session[services.HISTORY_KEY], before)

    def test_ai_failure_keeps_successful_simulation_for_later_chat(self):
        self.advisor.side_effect = TimeoutError("AI timed out")
        with self.assertLogs("game_api.services", level="ERROR"):
            response = self.simulate()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["advisor"]["reply"])
        self.assertEqual(response.json()["advisor"]["error"]["code"], "provider_error")
        self.assertEqual(self.client.session[services.SIMULATION_KEY]["result"]["score"], 73)
        self.advisor.side_effect = None
        self.chat("Explain the result now")
        self.assertEqual(self.advisor.call_args.kwargs["simulation"]["result"]["score"], 73)

    def test_engine_failure_preserves_previous_run(self):
        self.simulate()
        before = dict(self.client.session)
        self.engine.side_effect = RuntimeError("Engine failed")
        self.advisor.reset_mock()
        with self.assertLogs("game_api.services", level="ERROR"):
            response = self.simulate()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(dict(self.client.session), before)
        self.advisor.assert_not_called()

    def test_new_simulation_resets_old_conversation(self):
        self.chat("Old run")
        self.simulate()
        self.assertEqual(self.advisor.call_args.kwargs["history"], [])
        self.assertEqual(len(self.client.session[services.HISTORY_KEY]), 2)

    def test_history_is_bounded_to_complete_turns(self):
        for index in range(services.MAX_HISTORY_TURNS + 2):
            self.chat(str(index))
        history = self.client.session[services.HISTORY_KEY]
        self.assertEqual(len(history), services.MAX_HISTORY_TURNS * 2)
        self.assertEqual(history[0], {"role": "user", "content": "2"})
        self.assertEqual(history[-1]["role"], "assistant")

    def test_provider_mutations_do_not_corrupt_authoritative_state(self):
        def mutating_engine(*, decisions):
            decisions.clear()
            return {"score": 73}

        def mutating_advisor(*, message, history, simulation):
            history.append({"role": "user", "content": "injected"})
            simulation["result"]["score"] = 999
            simulation["decisions"].clear()
            return "Advice"

        self.engine.side_effect = mutating_engine
        self.advisor.side_effect = mutating_advisor
        response = self.simulate()
        self.assertEqual(response.json()["simulation"]["decisions"], DECISIONS)
        self.assertEqual(self.client.session[services.SIMULATION_KEY]["result"]["score"], 73)
        self.assertEqual(len(self.client.session[services.HISTORY_KEY]), 2)

    def test_invalid_engine_output_is_not_saved(self):
        for result in ([], {"score": float("nan")}, {"score": object()}):
            with self.subTest(result=result):
                self.engine.return_value = result
                with self.assertLogs("game_api.services", level="ERROR"):
                    response = self.simulate()
                self.assertEqual(response.status_code, 502)
                self.assertNotIn(services.SIMULATION_KEY, self.client.session)
        self.advisor.assert_not_called()

    def test_invalid_advisor_output_is_not_saved(self):
        for reply in (None, {}, "", " ", "x" * 12001):
            with self.subTest(reply_type=type(reply)):
                self.advisor.return_value = reply
                with self.assertLogs("game_api.services", level="ERROR"):
                    response = self.chat()
                self.assertEqual(response.status_code, 502)
                self.assertNotIn(services.HISTORY_KEY, self.client.session)

    def test_invalid_catalog_is_rejected_before_simulation(self):
        bad_catalogs = [
            {},
            {"districts": "wrong", "measures": []},
            {"districts": CATALOG["districts"] * 2, "measures": CATALOG["measures"]},
            {"districts": CATALOG["districts"], "measures": [{"id": "M1", "name": "X", "cost": -1, "scope": "city"}]},
        ]
        for catalog in bad_catalogs:
            with self.subTest(catalog=catalog):
                with patch("game_api.tests.catalog_provider", return_value=catalog):
                    with self.assertLogs("game_api.services", level="ERROR"):
                        response = self.simulate()
                self.assertEqual(response.status_code, 502)
        self.engine.assert_not_called()

    def test_game_rule_rejection_returns_player_facing_error(self):
        self.engine.side_effect = SimulationRejected("Selected measures exceed the budget.")
        response = self.simulate()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"error": {
            "code": "invalid_decisions",
            "message": "Selected measures exceed the budget.",
        }})
        self.assertNotIn(services.SIMULATION_KEY, self.client.session)
        self.advisor.assert_not_called()

    @override_settings(ALLOWED_HOSTS=["localhost"])
    def test_react_proxy_origin_is_accepted_and_foreign_origin_rejected(self):
        browser = Client(enforce_csrf_checks=True, HTTP_HOST="localhost:5173")
        browser.get("/api/catalog")
        token = browser.cookies["csrftoken"].value
        for origin, expected in (("http://localhost:5173", 200), ("https://foreign.example", 403)):
            with self.subTest(origin=origin):
                response = browser.post(
                    "/api/advisor/chat", {"message": "Hello"},
                    content_type="application/json", HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN=origin,
                )
                self.assertEqual(response.status_code, expected)
