"""Regression coverage for boundary failures, persistence and compact requests."""
from copy import deepcopy
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError

from akim_ai.agent import Advisor, check_selection, load_catalog
from akim_ai.chat import render_result
from akim_ai.contracts import BRIEF, finite_number
from akim_ai.json_io import loads, read_json
from akim_ai.providers import DemoModel, ModelError, OpenAIModel
from akim_ai.session import ChatSession


class BoundaryTests(unittest.TestCase):
    def test_strict_json_rejects_duplicates_constants_and_excess(self):
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}',
                     b'\xff', '[' * 2000):
            with self.subTest(text=str(text)[:30]), self.assertRaises(ValueError):
                loads(text)
        with self.assertRaises(ValueError):
            read_json(BytesIO(b'"abcdef"'), maximum=4)

    def test_missing_question_and_bad_stdin_are_handled(self):
        for request in ('{}', '{"question":"hi","question":"bye"}', '{"question":NaN}'):
            result = subprocess.run(
                [sys.executable, "-m", "akim_ai", "--provider", "demo", "--input", "-"],
                input=request, text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertNotIn("Traceback", result.stderr)
        result = subprocess.run(
            [sys.executable, "-m", "akim_ai", "--provider", "demo", "--input", "-"],
            input='{"question":"Что такое M5?"}', text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "ok")

    def test_suggest_requires_boolean_for_library_callers(self):
        self.assertEqual(Advisor(DemoModel()).run("Меры", suggest="false")["status"], "invalid_input")

    def test_finite_number_handles_large_integers(self):
        self.assertTrue(finite_number(10 ** 400))
        for value in (True, float("inf"), float("nan"), "1", None):
            self.assertFalse(finite_number(value))

    def test_catalog_rules_are_used_and_missing_measure_is_rejected(self):
        catalog = load_catalog()
        choices = DemoModel().generate("plan", "", {}, {})["candidates"][0]["decisions"]
        catalog["rules"]["max_per_direction"] = 1
        self.assertTrue(check_selection(choices, catalog))
        catalog["measures"] = [m for m in catalog["measures"] if m["id"] != "M5"]
        self.assertTrue(check_selection(choices, catalog))

    def test_candidate_facts_are_transmitted_once_and_are_isolated(self):
        captured = []
        class Recorder(DemoModel):
            def generate(self, stage, instructions, payload, schema):
                if stage == "brief":
                    captured.append(deepcopy(payload))
                    payload["evidence"]["M5"]["cost"] = -1
                return super().generate(stage, instructions, payload, schema)
        advisor = Advisor(Recorder())
        result = advisor.run("Меры", suggest=True)
        self.assertNotIn("checks", captured[0])
        self.assertEqual(captured[0]["evidence"]["candidate_1"], result["candidates"][0])
        self.assertEqual(result["evidence"]["M5"]["cost"], 25)
        self.assertEqual(advisor.catalog["measures"][4]["cost"], 25)

    def test_verified_score_is_shown_in_terminal(self):
        result = Advisor(DemoModel(), lambda _: {"valid": True, "score": 12.345}).run("Меры", suggest=True)
        with patch("sys.stdout", new_callable=StringIO) as output:
            render_result(result, load_catalog())
        self.assertIn("Score: 12.345", output.getvalue())
        self.assertNotIn("Score не рассчитан", output.getvalue())


class ProviderBoundaryTests(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "OPENAI_MODEL": "test-model"}):
            self.model = OpenAIModel()

    def test_malformed_responses_are_public_errors(self):
        cases = [[], {}, {"status": "incomplete"},
                 {"status": "completed", "output": None},
                 {"status": "completed", "output": [None]},
                 {"status": "completed", "output": [{"type": "message", "content": None}]}]
        for content in ([None], [{"type": "output_text", "text": 4}],
                        [{"type": "output_text", "text": "[]"}],
                        [{"type": "output_text", "text": '{"x":NaN}'}]):
            cases.append({"status": "completed", "output": [{"type": "message", "content": content}]})
        for case in cases:
            with self.subTest(case=case), patch("akim_ai.providers.urlopen", return_value=BytesIO(json.dumps(case).encode())):
                with self.assertRaises(ModelError) as raised:
                    self.model.generate("brief", "", {}, BRIEF)
                self.assertEqual(str(raised.exception), "response")

    def test_refusal_and_wrapped_timeout(self):
        response = {"status": "completed", "output": [{"type": "message", "content": [{"type": "refusal"}]}]}
        with patch("akim_ai.providers.urlopen", return_value=BytesIO(json.dumps(response).encode())):
            with self.assertRaisesRegex(ModelError, "refusal"):
                self.model.generate("brief", "", {}, BRIEF)
        with patch("akim_ai.providers.urlopen", side_effect=URLError(TimeoutError())):
            with self.assertRaisesRegex(ModelError, "timeout"):
                self.model.generate("brief", "", {}, BRIEF)

    def test_blank_configuration_rejected(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "  ", "OPENAI_MODEL": "test"}):
            with self.assertRaises(ValueError):
                OpenAIModel()

    def test_oversized_response_and_broken_connection(self):
        with patch("akim_ai.providers.urlopen", return_value=BytesIO(b" " * 2_000_001)):
            with self.assertRaisesRegex(ModelError, "response"):
                self.model.generate("brief", "", {}, BRIEF)
        with patch("akim_ai.providers.urlopen", side_effect=ConnectionResetError("private data")):
            with self.assertRaisesRegex(ModelError, "network"):
                self.model.generate("brief", "", {}, BRIEF)


class PersistenceTests(unittest.TestCase):
    def test_stale_writer_cannot_overwrite_newer_history(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            ChatSession().save(path)
            first, stale = ChatSession.load(path), ChatSession.load(path)
            first.set_priority("Нура")
            first.save(path)
            stale.set_priority("Сарыарка")
            with self.assertRaisesRegex(ValueError, "другим процессом"):
                stale.save(path)
            self.assertEqual(ChatSession.load(path).conversation["priority"], "Нура")
            self.assertFalse(path.with_name("session.json.lock").exists())

    def test_new_session_cannot_overwrite_an_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            first, second = ChatSession.load(path), ChatSession.load(path)
            first.save(path)
            with self.assertRaises(ValueError):
                second.save(path)

    def test_reset_preserves_revision_and_noop_save_skips_replace(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            session = ChatSession()
            session.set_priority("Нура")
            session.save(path)
            with patch("akim_ai.session.os.replace") as replace:
                session.save(path)
                replace.assert_not_called()
            session.reset()
            session.save(path)
            self.assertEqual(ChatSession.load(path).conversation["priority"], "")

    def test_failed_atomic_replace_preserves_original_and_cleans_temporary(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            session = ChatSession()
            session.save(path)
            original = path.read_bytes()
            session.set_priority("Нура")
            with patch("akim_ai.session.os.replace", side_effect=OSError("disk error")):
                with self.assertRaises(OSError):
                    session.save(path)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_lock_prevents_write_and_is_not_removed_by_non_owner(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            lock = path.with_name("session.json.lock")
            lock.write_text("")
            with self.assertRaisesRegex(ValueError, "занят"):
                ChatSession().save(path)
            self.assertTrue(lock.exists())
            self.assertFalse(path.exists())

    def test_invalid_history_and_duplicate_ids_are_rejected(self):
        session = ChatSession()
        session.ask(Advisor(DemoModel()), "Меры")
        data = {"version": "1", "decisions": [], "conversation": session.conversation}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.json"
            for corruption in ("history", "previous_candidates"):
                broken = deepcopy(data)
                if corruption == "history":
                    broken["conversation"]["history"].reverse()
                else:
                    broken["conversation"]["previous_candidates"] *= 2
                path.write_text(json.dumps(broken), encoding="utf-8")
                with self.assertRaises(ValueError):
                    ChatSession.load(path)
