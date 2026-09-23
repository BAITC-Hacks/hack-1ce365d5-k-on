"""Bounded plan -> optional simulation -> explanation workflow. No score engine."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path

from .contracts import BRIEF, PLAN, DECISION, HISTORY, array, validate, finite_number
from .prompts import PLANNER, EXPLAINER


def load_catalog():
    return json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))


def check_selection(decisions, catalog, complete=True):
    """Advisory checks only; the server engine remains authoritative."""
    try:
        validate(decisions, array(DECISION, 5))
    except ValueError as exc:
        return [str(exc)]
    errors = []
    if complete and len(decisions) != 5:
        errors.append("Нужно выбрать ровно пять мер.")
    measures = {m["id"]: m for m in catalog["measures"]}
    ids = [d["measure_id"] for d in decisions]
    if len(set(ids)) != len(ids):
        errors.append("Одна мера выбрана несколько раз.")
    if sum(measures[i]["cost"] for i in ids) > catalog["rules"]["budget"]:
        errors.append("Превышен бюджет.")
    if any(n > 2 for n in Counter(measures[i]["direction"] for i in ids).values()):
        errors.append("Больше двух мер одного направления.")
    for d in decisions:
        if (measures[d["measure_id"]]["scope"] == "city") != (d["district_id"] is None):
            errors.append(f"Неверно указан район для {d['measure_id']}.")
    locations = {d["measure_id"]: d["district_id"] for d in decisions}
    for a, b in catalog["rules"]["global_conflicts"]:
        if a in ids and b in ids:
            errors.append(f"Несовместимые меры: {a}, {b}.")
    for a, b in catalog["rules"]["same_district_conflicts"]:
        if a in locations and b in locations and locations[a] == locations[b]:
            errors.append(f"{a} и {b} нельзя назначить в один район.")
    return errors


def signature(decisions):
    return tuple(sorted((d["measure_id"], d["district_id"] or "") for d in decisions))


class Advisor:
    def __init__(self, model, simulator=None, catalog=None):
        # model.generate(stage, instructions, payload, schema) -> dict
        # simulator({decisions: [...]}) -> engine result; inject only server-side.
        self.model = model
        self.simulator = simulator
        self.catalog = catalog or load_catalog()

    def run(self, question, decisions=None, *, suggest=False, simulation=None, history=None):
        decisions = deepcopy(decisions if decisions is not None else [])
        output = {"status": "ok", "mode": "consult", "briefing": None,
                  "simulation": None, "candidates": [], "warnings": [], "evidence": {}}
        if not isinstance(question, str) or not question.strip() or len(question) > 4000:
            return {**output, "status": "invalid_input", "errors": ["Нужен вопрос длиной до 4000 символов."]}
        history = deepcopy(history if history is not None else [])
        try:
            validate(history, HISTORY)
        except ValueError as exc:
            return {**output, "status": "invalid_input", "errors": [str(exc)]}
        errors = check_selection(decisions, self.catalog, complete=False)
        if errors:
            return {**output, "status": "invalid_input", "errors": errors}
        # simulation must be provided by trusted backend code, never directly by a browser.
        if simulation is not None:
            if (not isinstance(simulation, dict) or simulation.get("valid") is not True
                    or not finite_number(simulation.get("score"))):
                return {**output, "status": "invalid_simulation", "errors": ["Нет корректного результата движка."]}
            errors = check_selection(decisions, self.catalog)
            if errors:
                return {**output, "status": "invalid_input", "errors": errors}
            output.update(mode="analyze", simulation=deepcopy(simulation))
        evidence = {"rules": self.catalog["rules"], "synergies": self.catalog["synergies"]}
        for collection in ("measures", "districts", "indicators"):
            for item in self.catalog[collection]:
                evidence[item["id"]] = item
        if simulation is not None:
            evidence["current_result"] = deepcopy(simulation)
        payload = {"question": question, "history": history, "decisions": decisions, "mode": output["mode"],
                   "evidence": evidence, "simulator_available": self.simulator is not None}
        if suggest:
            try:
                plan = self.model.generate("plan", PLANNER, deepcopy(payload), PLAN)
                validate(plan, PLAN)
                seen = {signature(decisions)}
                for item in plan["candidates"]:
                    key = signature(item["decisions"])
                    if key in seen:
                        continue
                    seen.add(key)
                    checked = self._check_candidate(item)
                    checked["id"] = f"candidate_{len(output['candidates']) + 1}"
                    output["candidates"].append(checked)
                    evidence[checked["id"]] = deepcopy(checked)
            except Exception:
                # Do not expose raw provider errors, credentials, or request bodies.
                output["warnings"].append("Не удалось подготовить варианты. Попробуйте ещё раз.")
        payload["checks"] = output["candidates"]
        try:
            brief = self.model.generate("brief", EXPLAINER, deepcopy(payload), BRIEF)
            validate(brief, BRIEF)
            for statement in [brief["summary"], *brief["strengths"], *brief["risks"]]:
                if not statement["evidence_ids"] or any(k not in evidence for k in statement["evidence_ids"]):
                    raise ValueError("Missing or unknown evidence reference")
            output["briefing"] = brief
        except Exception:
            output["status"] = "unavailable"
            output["warnings"].append("AI-объяснение недоступно. Данные расчёта сохранены.")
        output["evidence"] = deepcopy(evidence)
        return output

    def _check_candidate(self, item):
        candidate = {**deepcopy(item), "status": "unverified", "verified": False,
                     "simulation": None, "errors": []}
        errors = check_selection(candidate["decisions"], self.catalog)
        if errors:
            return {**candidate, "status": "invalid", "errors": errors}
        if self.simulator is None:
            return candidate
        try:
            result = self.simulator({"decisions": deepcopy(candidate["decisions"])})
            if not isinstance(result, dict):
                raise ValueError("Invalid simulator response")
            if result.get("valid") is False:
                return {**candidate, "status": "invalid", "errors": ["Движок отклонил набор."]}
            if result.get("valid") is not True or not finite_number(result.get("score")):
                raise ValueError("Invalid simulator score")
            return {**candidate, "status": "verified", "verified": True,
                    "simulation": deepcopy(result)}
        except Exception:
            return {**candidate, "status": "error", "errors": ["Не удалось проверить вариант."]}
