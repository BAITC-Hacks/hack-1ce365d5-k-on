"""Numerical and HTTP regression coverage for the real scoring provider."""

import json
from copy import deepcopy
from unittest.mock import patch

from django.test import Client, SimpleTestCase, TestCase, override_settings

from akim_ai.agent import load_catalog

from .engine import simulate
from .errors import SimulationRejected
from .services import SIMULATION_KEY


def plan(*items):
    return [{"measure_id": measure, "district_id": district} for measure, district in items]


GOLDEN_PLAN = plan(
    ("M1", "ESIL"), ("M2", None), ("M8", "NURA"),
    ("M10", "SARYARKA"), ("M12", None),
)


@override_settings(GAME_CATALOG_PROVIDER="akim_ai.agent.load_catalog")
class ScoringEngineTests(SimpleTestCase):
    def with_catalog(self, catalog, decisions=GOLDEN_PLAN):
        with patch("game_api.engine.get_catalog", return_value=catalog):
            return simulate(decisions=decisions)

    def quiet_catalog(self):
        catalog = load_catalog()
        catalog["synergies"] = []
        for measure in catalog["measures"]:
            measure["full_effects"] = {}
        return catalog

    def test_hand_calculated_real_catalog_plan(self):
        result = simulate(decisions=GOLDEN_PLAN)
        # City measures add 3 to T1, 2.25 to B2, and 4.375 to C2 everywhere.
        # Esil adds 4.5 T1 + 6.75 T2 + 2 synergy; Nura adds 8.75 S2;
        # Saryarka adds 10.5 B1 + 1.75 B2 + 2 synergy.
        self.assertIs(result["valid"], True)
        self.assertEqual(result["budget_spent"], 86)
        self.assertEqual(result["budget_remaining"], 14)
        self.assertEqual(result["horizon_quarters"], 8)
        expected_scores = {
            "ESIL": 65.5875, "ALMATY": 57.8625, "SARYARKA": 56.8875,
            "BAIKONUR": 57.5625, "NURA": 51.1375,
        }
        for district, score in expected_scores.items():
            self.assertAlmostEqual(result["district_scores"][district], score)
        self.assertAlmostEqual(result["weighted_average"], 58.63825)
        self.assertAlmostEqual(result["min_district_score"], 51.1375)
        self.assertAlmostEqual(result["score"], 55.388025)
        self.assertAlmostEqual(result["baseline"]["weighted_average"], 56.893)
        self.assertAlmostEqual(result["baseline"]["score"], 52.6151)
        self.assertAlmostEqual(result["score_delta"], 2.772925)
        self.assertEqual(result["critical_indicators"], [
            {"district_id": "NURA", "indicator_id": "S1", "value": 38},
        ])
        self.assertEqual(result["critical_count"], 1)
        self.assertEqual(result["baseline"]["critical_count"], 2)
        json.dumps(result, allow_nan=False)

    def test_lag_city_expansion_and_synergy_only_affect_their_targets(self):
        result = simulate(decisions=GOLDEN_PLAN)
        final = result["district_indicators"]
        baseline = result["baseline"]["district_indicators"]
        self.assertEqual(final["ESIL"]["T1"], 54.5)
        self.assertEqual(final["ESIL"]["T2"], 68.75)
        self.assertEqual(final["NURA"]["S2"], 43.75)
        self.assertEqual(final["SARYARKA"]["B1"], 70.5)
        for district in baseline:
            self.assertEqual(final[district]["C2"] - baseline[district]["C2"], 4.375)
            if district != "ESIL":
                self.assertEqual(final[district]["T1"] - baseline[district]["T1"], 3)
        self.assertEqual(result["applied_synergies"], [
            {"pair": ["M1", "M2"], "district_id": "ESIL", "effects": {"T1": 2}},
            {"pair": ["M10", "M12"], "district_id": "SARYARKA", "effects": {"B1": 2}},
        ])

    def test_ecology_synergy_applies_once_at_final_horizon(self):
        result = simulate(decisions=plan(
            ("M5", "SARYARKA"), ("M6", None), ("M9", "NURA"),
            ("M10", "ESIL"), ("M14", None),
        ))
        self.assertEqual(result["district_indicators"]["SARYARKA"]["E2"], 52.25)
        self.assertEqual(result["district_indicators"]["ALMATY"]["E2"], 56.5)
        self.assertEqual(len(result["applied_synergies"]), 1)
        self.assertEqual(result["applied_synergies"][0]["effects"], {"E2": 2})

    def test_all_effects_are_combined_before_clamping_and_order_is_irrelevant(self):
        catalog = self.quiet_catalog()
        catalog["districts"][0]["initial_indicators"]["T1"] = 95
        catalog["measures"][0].update(lag=0, full_effects={"T1": 200, "T2": 200})
        catalog["measures"][1].update(lag=0, full_effects={"T1": -220})
        result = self.with_catalog(catalog)
        self.assertEqual(result["district_indicators"]["ESIL"]["T1"], 75)
        self.assertEqual(result["district_indicators"]["ESIL"]["T2"], 100)
        self.assertEqual(result["district_indicators"]["ALMATY"]["T1"], 0)
        self.assertEqual(result, self.with_catalog(catalog, list(reversed(GOLDEN_PLAN))))

    def test_critical_penalty_counts_each_indicator_and_excludes_exact_threshold(self):
        catalog = self.quiet_catalog()
        for district in catalog["districts"]:
            district["initial_indicators"] = dict.fromkeys(district["initial_indicators"], 50)
        catalog["districts"][0]["initial_indicators"].update(T1=39.999, T2=39)
        catalog["districts"][1]["initial_indicators"].update(T1=40, T2=39)
        result = self.with_catalog(catalog)
        self.assertEqual(result["critical_count"], 3)
        self.assertNotIn(
            {"district_id": "ALMATY", "indicator_id": "T1", "value": 40},
            result["critical_indicators"],
        )
        self.assertAlmostEqual(result["score"], 0.7 * result["weighted_average"] + 0.3 * result["min_district_score"] - 3)
        # The plan spends 86 but has no effects; the remaining 14 earns no bonus.
        self.assertEqual(result["score"], result["baseline"]["score"])

    def test_configured_catalog_supplies_effects_and_horizon(self):
        catalog = self.quiet_catalog()
        catalog["rules"]["horizon_quarters"] = 16
        catalog["measures"][0].update(lag=4, full_effects={"T1": 8})
        result = self.with_catalog(catalog)
        self.assertEqual(result["district_indicators"]["ESIL"]["T1"], 51)
        self.assertEqual(result["horizon_quarters"], 16)

    def test_rejects_wrong_count_shape_ids_scopes_and_duplicate_measure_ids(self):
        invalid = [None, [], GOLDEN_PLAN[:4], GOLDEN_PLAN + [GOLDEN_PLAN[0]]]
        for replacement in (
            None, {"measure_id": "M1"},
            {"measure_id": "unknown", "district_id": "ESIL"},
            {"measure_id": [], "district_id": "ESIL"},
            {"measure_id": "M1", "district_id": None},
            {"measure_id": "M1", "district_id": "unknown"},
            {"measure_id": "M1", "district_id": []},
            {"measure_id": "M2", "district_id": "ESIL"},
            {"measure_id": "M10", "district_id": "ESIL"},
            {"measure_id": "M10", "district_id": "SARYARKA"},
            {"measure_id": "M1", "district_id": "ESIL", "score": 99},
        ):
            invalid.append([replacement, *GOLDEN_PLAN[1:]])
        for decisions in invalid:
            with self.subTest(decisions=decisions), self.assertRaises(SimulationRejected):
                simulate(decisions=decisions)

    def test_budget_direction_and_conflict_rules(self):
        cases = [
            ("budget", plan(("M3", "ESIL"), ("M5", "ALMATY"), ("M7", "NURA"), ("M13", "SARYARKA"), ("M2", None))),
            ("direction", plan(("M4", "ESIL"), ("M5", "ALMATY"), ("M6", None), ("M10", "NURA"), ("M12", None))),
            ("together", plan(("M1", "ESIL"), ("M3", "ALMATY"), ("M8", "NURA"), ("M10", "SARYARKA"), ("M12", None))),
            ("same district", plan(("M4", "ESIL"), ("M7", "ESIL"), ("M2", None), ("M10", "NURA"), ("M12", None))),
            ("same district", plan(("M5", "ALMATY"), ("M13", "ALMATY"), ("M9", "NURA"), ("M10", "NURA"), ("M12", None))),
        ]
        for message, decisions in cases:
            with self.subTest(message=message), self.assertRaisesRegex(SimulationRejected, message):
                simulate(decisions=decisions)

    def test_district_conflicts_are_allowed_in_different_districts(self):
        for decisions in (
            plan(("M4", "ESIL"), ("M7", "NURA"), ("M2", None), ("M10", "NURA"), ("M12", None)),
            plan(("M5", "ALMATY"), ("M13", "SARYARKA"), ("M9", "NURA"), ("M10", "NURA"), ("M12", None)),
        ):
            with self.subTest(decisions=decisions):
                self.assertTrue(simulate(decisions=decisions)["valid"])

    def test_decisions_and_catalog_are_not_mutated(self):
        catalog, decisions = load_catalog(), deepcopy(GOLDEN_PLAN)
        before_catalog, before_decisions = deepcopy(catalog), deepcopy(decisions)
        result = self.with_catalog(catalog, decisions)
        self.assertEqual(catalog, before_catalog)
        self.assertEqual(decisions, before_decisions)
        result["baseline"]["district_indicators"]["ESIL"]["T1"] = 999
        self.assertEqual(catalog, before_catalog)
        self.assertEqual(result["district_indicators"]["ESIL"]["T1"], 54.5)

    def test_incomplete_or_invalid_catalog_metadata_fails_safely(self):
        changes = [
            lambda c: c["measures"][0].pop("lag"),
            lambda c: c["measures"][0].update(lag=9),
            lambda c: c["measures"][0].update(cost=True),
            lambda c: c["measures"][0].update(full_effects={"T1": float("nan")}),
            lambda c: c["measures"][0].update(full_effects={"UNKNOWN": 1}),
            lambda c: c["districts"][0]["initial_indicators"].pop("T1"),
            lambda c: c["districts"][0]["initial_indicators"].update(T1=101),
            lambda c: c["districts"][0].update(population_share=0),
            lambda c: c["districts"][0].update(population_share=True),
            lambda c: c["rules"].update(horizon_quarters=0),
            lambda c: c["rules"].update(budget=float("inf")),
            lambda c: c["rules"].update(global_conflicts=[["M1", "UNKNOWN"]]),
            lambda c: c["synergies"][0].update(district_from="M2"),
            lambda c: c["synergies"].append(deepcopy(c["synergies"][0])),
        ]
        for index, change in enumerate(changes):
            with self.subTest(case=index):
                catalog = load_catalog()
                change(catalog)
                with self.assertRaises(ValueError):
                    self.with_catalog(catalog)


@override_settings(
    GAME_CATALOG_PROVIDER="akim_ai.agent.load_catalog",
    GAME_SIMULATION_PROVIDER="game_api.engine.simulate",
    ADVISOR_REPLY_PROVIDER="game_api.integrations.reply",
    AKIM_AI_PROVIDER="demo",
)
class ScoringAPIIntegrationTests(TestCase):
    def test_real_simulation_and_advisor_work_with_csrf_and_server_session(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(browser.get("/api/catalog").status_code, 200)
        response = browser.post(
            "/api/simulate", {"decisions": GOLDEN_PLAN}, content_type="application/json",
            HTTP_X_CSRFTOKEN=browser.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertAlmostEqual(body["simulation"]["result"]["score"], 55.388025)
        self.assertIn("ДЕМО:", body["advisor"]["reply"])
        self.assertNotIn("error", body["advisor"])
        self.assertEqual(browser.session[SIMULATION_KEY], body["simulation"])
        response = browser.post(
            "/api/advisor/chat", {"message": "Объясни результат"}, content_type="application/json",
            HTTP_X_CSRFTOKEN=browser.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("ДЕМО:", response.json()["reply"])

    def test_engine_rule_failure_returns_400_without_saving_a_result(self):
        decisions = plan(("M1", "ESIL"), ("M3", "ALMATY"), ("M8", "NURA"), ("M10", "SARYARKA"), ("M12", None))
        response = self.client.post("/api/simulate", {"decisions": decisions}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "invalid_decisions")
        self.assertNotIn(SIMULATION_KEY, self.client.session)
