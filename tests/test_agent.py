import json
import unittest
from copy import deepcopy
from pathlib import Path

from akim_ai.agent import Advisor, check_selection, load_catalog
from akim_ai.providers import DemoModel


DECISIONS = DemoModel().generate("plan", "", {}, {})["candidates"][0]["decisions"]


class AgentTests(unittest.TestCase):
    def test_no_engine_never_verifies_or_creates_score(self):
        out = Advisor(DemoModel()).run("Предложи меры", suggest=True)
        self.assertEqual(out["candidates"][0]["status"], "unverified")
        self.assertFalse(out["candidates"][0]["verified"])
        self.assertIsNone(out["candidates"][0]["simulation"])

    def test_verified_score_is_copied_from_engine(self):
        # Synthetic engine stub only; this is not a calculation of the dataset.
        out = Advisor(DemoModel(), lambda _: {"valid": True, "score": 12.345}).run("Совет", suggest=True)
        self.assertEqual(out["candidates"][0]["simulation"]["score"], 12.345)
        self.assertTrue(out["candidates"][0]["verified"])

    def test_false_valid_and_non_finite_scores_rejected(self):
        for result in ({"valid": False}, {"valid": 1, "score": 5},
                       {"valid": True, "score": float("nan")}, {"valid": True, "score": True}):
            with self.subTest(result=result):
                out = Advisor(DemoModel(), lambda _, r=result: r).run("Совет", suggest=True)
                self.assertFalse(out["candidates"][0]["verified"])

    def test_engine_exception_does_not_leak(self):
        def broken(_):
            raise RuntimeError("SECRET")
        out = Advisor(DemoModel(), broken).run("Совет", suggest=True)
        self.assertEqual(out["candidates"][0]["status"], "error")
        self.assertNotIn("SECRET", json.dumps(out))

    def test_unknown_evidence_rejects_brief(self):
        class BadModel(DemoModel):
            def generate(self, *args):
                out = super().generate(*args)
                out["summary"]["evidence_ids"] = ["invented"]
                return out
        out = Advisor(BadModel()).run("Вопрос")
        self.assertEqual(out["status"], "unavailable")
        self.assertIsNone(out["briefing"])

    def test_llm_cannot_set_verified_field(self):
        class BadModel(DemoModel):
            def generate(self, stage, *args):
                out = super().generate(stage, *args)
                if stage == "plan":
                    out["candidates"][0]["verified"] = True
                return out
        out = Advisor(BadModel()).run("Совет", suggest=True)
        self.assertEqual(out["candidates"], [])
        self.assertTrue(out["warnings"])

    def test_duplicate_candidates_only_call_engine_once(self):
        class RepeatModel(DemoModel):
            def generate(self, stage, *args):
                out = super().generate(stage, *args)
                if stage == "plan":
                    out["candidates"] *= 3
                return out
        calls = []
        def engine(request):
            calls.append(request)
            return {"valid": True, "score": 1}
        Advisor(RepeatModel(), engine).run("Совет", suggest=True)
        self.assertEqual(len(calls), 1)

    def test_more_than_three_candidates_rejected_before_engine(self):
        class TooMany(DemoModel):
            def generate(self, stage, *args):
                out = super().generate(stage, *args)
                if stage == "plan":
                    out["candidates"] *= 4
                return out
        calls = []
        out = Advisor(TooMany(), lambda r: calls.append(r)).run("Совет", suggest=True)
        self.assertEqual(calls, [])
        self.assertEqual(out["candidates"], [])

    def test_invalid_current_decisions_do_not_call_model(self):
        class Never:
            def generate(self, *args):
                raise AssertionError("should not be called")
        bad = [{"measure_id": "M12", "district_id": "NURA"}]
        out = Advisor(Never()).run("Вопрос", bad)
        self.assertEqual(out["status"], "invalid_input")

    def test_provider_failure_preserves_simulation(self):
        class Offline:
            def generate(self, *args):
                raise TimeoutError("SECRET")
        simulation = {"valid": True, "score": 12.34}
        out = Advisor(Offline()).run("Объясни", DECISIONS, simulation=simulation)
        self.assertEqual(out["status"], "unavailable")
        self.assertEqual(out["simulation"], simulation)
        self.assertNotIn("SECRET", json.dumps(out))

    def test_examples_and_measure_scopes(self):
        catalog = load_catalog()
        self.assertEqual(check_selection(DECISIONS, catalog), [])
        duplicate = deepcopy(DECISIONS)
        duplicate[-1] = duplicate[0]
        self.assertTrue(check_selection(duplicate, catalog))
        conflict = [{"measure_id": "M1", "district_id": "NURA"},
                    {"measure_id": "M3", "district_id": "ESIL"}]
        self.assertTrue(check_selection(conflict, catalog, complete=False))

    def test_invalid_baseline_is_not_sent_to_model(self):
        out = Advisor(DemoModel()).run("Объясни", DECISIONS, simulation={"valid": False})
        self.assertEqual(out["status"], "invalid_simulation")


if __name__ == "__main__":
    unittest.main()
