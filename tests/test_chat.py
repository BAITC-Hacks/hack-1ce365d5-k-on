from copy import deepcopy
from io import BytesIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from akim_ai.agent import Advisor
from akim_ai.config import load_env
from akim_ai.contracts import BRIEF
from akim_ai.providers import DemoModel, ModelError, OpenAIModel
from akim_ai.session import ChatSession, MAX_HISTORY_CHARS


class Recorder(DemoModel):
    def __init__(self):
        self.calls = []

    def generate(self, stage, instructions, payload, schema):
        self.calls.append((stage, deepcopy(payload)))
        return super().generate(stage, instructions, payload, schema)


class SessionTests(unittest.TestCase):
    def test_followup_receives_history_priority_and_previous_candidates(self):
        session, model = ChatSession(), Recorder()
        session.set_priority("Школы Нуры")
        session.ask(Advisor(model), "Предложи меры")
        session.ask(Advisor(model), "А что насчёт экологии?")
        for stage, payload in model.calls[-2:]:
            context = payload["evidence"]["conversation"]
            self.assertEqual(context["priority"], "Школы Нуры")
            self.assertEqual(context["history"][0]["content"], "Предложи меры")
            self.assertEqual(len(context["previous_candidates"]), 1)

    def test_proposal_does_not_change_decisions_until_choose(self):
        session = ChatSession()
        session.ask(Advisor(DemoModel()), "Предложи")
        self.assertEqual(session.decisions, [])
        session.choose("candidate_1")
        self.assertEqual(len(session.decisions), 5)
        with self.assertRaises(ValueError):
            session.choose("candidate_999")

    def test_round_trip_preserves_memory_but_not_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "memory.json"
            session = ChatSession()
            session.set_priority("Экология")
            session.ask(Advisor(DemoModel(), lambda _: {"valid": True, "score": 8}), "Меры")
            session.choose("candidate_1")
            session.save(path)
            restored = ChatSession.load(path)
            self.assertEqual(restored.decisions, session.decisions)
            self.assertEqual(restored.conversation, session.conversation)
            self.assertNotIn('"verified"', path.read_text())
            if os.name == "posix":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_bad_memory_is_not_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "memory.json"
            path.write_text("broken")
            with self.assertRaises(ValueError):
                ChatSession.load(path)
            self.assertEqual(path.read_text(), "broken")

    def test_histories_are_isolated_and_bounded(self):
        first, second = ChatSession(), ChatSession()
        for i in range(30):
            first.ask(Advisor(DemoModel()), f"Вопрос {i}", suggest=False)
        self.assertEqual(len(first.conversation["history"]), 24)
        self.assertEqual(second.conversation["history"], [])
        self.assertEqual(first.conversation["history"][0]["role"], "user")
        for _ in range(10):
            first.ask(Advisor(DemoModel()), "а" * 4000, suggest=False)
        self.assertLessEqual(sum(len(m["content"]) for m in first.conversation["history"]), MAX_HISTORY_CHARS)

    def test_failure_preserves_existing_session(self):
        class Offline:
            def generate(self, *args):
                raise ModelError("timeout")
        session = ChatSession()
        session.ask(Advisor(DemoModel()), "Меры")
        before = deepcopy(session.conversation)
        result = session.ask(Advisor(Offline()), "Замени меру")
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(before, session.conversation)
        self.assertIn(ModelError.MESSAGES["timeout"], result["warnings"])

    def test_plain_explanation_keeps_candidates_available(self):
        session = ChatSession()
        advisor = Advisor(DemoModel())
        session.ask(advisor, "Меры")
        session.ask(advisor, "Что такое M5?", suggest=False)
        session.choose("candidate_1")
        self.assertEqual(len(session.decisions), 5)


class ConfigurationTests(unittest.TestCase):
    def test_dotenv_respects_existing_environment_and_quotes(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            path = Path(directory) / ".env"
            path.write_text('OPENAI_API_KEY="file-key"\nOPENAI_MODEL=test-model\n')
            os.environ["OPENAI_API_KEY"] = "environment-key"
            load_env(path)
            self.assertEqual(os.environ["OPENAI_API_KEY"], "environment-key")
            self.assertEqual(os.environ["OPENAI_MODEL"], "test-model")

    def test_bad_dotenv_does_not_expose_content_or_partially_apply(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            path = Path(directory) / ".env"
            path.write_text('OPENAI_API_KEY=secret-key\nBAD=secret-value\n')
            with self.assertRaises(ValueError) as error:
                load_env(path)
            self.assertNotIn("secret", str(error.exception))
            self.assertNotIn("OPENAI_API_KEY", os.environ)

    def test_request_contains_conversation_and_strict_schema(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "test-model"}):
            model = OpenAIModel()
        brief = DemoModel().generate("brief", "", {}, BRIEF)
        response = {"status": "completed", "output": [{"type": "message", "content": [
            {"type": "output_text", "text": json.dumps(brief)}]}]}
        with patch("akim_ai.providers.urlopen", return_value=BytesIO(json.dumps(response).encode())) as call:
            self.assertEqual(model.generate("brief", "instructions", {"history": ["Нура"]}, BRIEF), brief)
        body = json.loads(call.call_args.args[0].data)
        self.assertFalse(body["store"])
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertIn("Нура", json.loads(body["input"][0]["content"])["history"])

    def test_http_failure_does_not_leak_provider_body(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "test-model"}):
            model = OpenAIModel()
        error = HTTPError("https://example.test", 401, "secret", {}, BytesIO(b"secret-key"))
        with patch("akim_ai.providers.urlopen", side_effect=error):
            with self.assertRaises(ModelError) as raised:
                model.generate("brief", "", {}, BRIEF)
        self.assertEqual(raised.exception.public_message, ModelError.MESSAGES["auth"])
        self.assertNotIn("secret", str(raised.exception))


class CLITests(unittest.TestCase):
    def test_chat_commands_save_and_reload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chat.json"
            command = [sys.executable, "-m", "akim_ai", "--provider", "demo", "--chat", "--session", str(path)]
            first = subprocess.run(command, input="/priority Школы Нуры\nПредложи меры\n/choose candidate_1\n/exit\n",
                                   text=True, capture_output=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertIn("ДЕМО", first.stdout)
            second = subprocess.run(command, input="/show\n/exit\n", text=True, capture_output=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertIn("Школы Нуры", second.stdout)
            self.assertIn("В памяти: 1", second.stdout)
            self.assertEqual(len(ChatSession.load(path).decisions), 5)

    def test_new_clears_session(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chat.json"
            command = [sys.executable, "-m", "akim_ai", "--provider", "demo", "--chat", "--session", str(path)]
            run = subprocess.run(command, input="/priority Нура\nВопрос\n/new\n/exit\n", text=True, capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(ChatSession.load(path).conversation, ChatSession().conversation)


if __name__ == "__main__":
    unittest.main()
