"""Deterministic eight-quarter scoring using the configured game catalog.

Measure effects are multiplied by ``(horizon - lag) / horizon``. The catalog
does not specify synergy timing, so listed synergy effects are interpreted as
final-horizon bonuses, applied once without a second lag adjustment. All effects
are combined before indicators are clamped; decision order cannot change a score.
"""

import math
from collections import Counter
from copy import deepcopy

from .errors import SimulationRejected
from .services import get_catalog


def _number(value, label, *, minimum=None, maximum=None):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"Catalog {label} must be a finite number.")
    if minimum is not None and value < minimum:
        raise ValueError(f"Catalog {label} must be at least {minimum}.")
    if maximum is not None and value > maximum:
        raise ValueError(f"Catalog {label} must be at most {maximum}.")
    return value


def _entries(catalog, key):
    values = catalog.get(key)
    if not isinstance(values, list) or not values:
        raise ValueError(f"Catalog needs a non-empty {key} list.")
    indexed = {}
    for item in values:
        if not isinstance(item, dict):
            raise ValueError(f"Catalog {key} entries must be objects.")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier.strip() or identifier in indexed:
            raise ValueError(f"Catalog {key} IDs must be unique non-empty strings.")
        indexed[identifier] = item
    return indexed


def _effects(value, indicators, label):
    if not isinstance(value, dict) or not set(value) <= indicators.keys():
        raise ValueError(f"Catalog {label} must map known indicators to numeric effects.")
    for indicator, effect in value.items():
        _number(effect, f"{label}.{indicator}")


def _pair(value, measures, label):
    if (
        not isinstance(value, list) or len(value) != 2
        or any(not isinstance(item, str) or item not in measures for item in value)
        or value[0] == value[1]
    ):
        raise ValueError(f"Catalog {label} must contain two distinct known measure IDs.")


def _validate_catalog(catalog):
    """Reject incomplete numerical catalogs instead of fabricating game data."""
    if not isinstance(catalog, dict) or not isinstance(catalog.get("rules"), dict):
        raise ValueError("The scoring catalog needs a rules object.")
    rules = catalog["rules"]
    for key in ("decision_count", "max_per_direction", "horizon_quarters"):
        if type(rules.get(key)) is not int or rules[key] <= 0:
            raise ValueError(f"Catalog rules.{key} must be a positive integer.")
    _number(rules.get("budget"), "rules.budget", minimum=0)
    _number(rules.get("critical_threshold_exclusive"), "rules.critical_threshold_exclusive", minimum=0, maximum=100)
    if rules.get("leftover_budget_bonus") != 0:
        raise ValueError("This engine supports no leftover-budget bonus.")

    indicators = _entries(catalog, "indicators")
    if len(indicators) != 10:
        raise ValueError("The scoring catalog must define all ten indicators.")
    districts = _entries(catalog, "districts")
    for identifier, district in districts.items():
        _number(district.get("population_share"), f"{identifier}.population_share", minimum=0, maximum=1)
        initial = district.get("initial_indicators")
        if not isinstance(initial, dict) or initial.keys() != indicators.keys():
            raise ValueError(f"Catalog {identifier} needs all ten initial indicators.")
        for indicator, value in initial.items():
            _number(value, f"{identifier}.{indicator}", minimum=0, maximum=100)
    total_share = math.fsum(district["population_share"] for district in districts.values())
    if not math.isclose(total_share, 1, rel_tol=1e-9, abs_tol=1e-9):
        raise ValueError("Catalog district population shares must sum to one.")
    # Normalize the last floating-point rounding error, never missing population.
    shares = {identifier: district["population_share"] / total_share for identifier, district in districts.items()}

    measures = _entries(catalog, "measures")
    for identifier, measure in measures.items():
        if measure.get("scope") not in ("city", "district"):
            raise ValueError(f"Catalog {identifier} needs a city or district scope.")
        direction = measure.get("direction")
        if not isinstance(direction, str) or not direction.strip():
            raise ValueError(f"Catalog {identifier} needs a direction.")
        _number(measure.get("cost"), f"{identifier}.cost", minimum=0)
        lag = measure.get("lag")
        if type(lag) is not int or not 0 <= lag <= rules["horizon_quarters"]:
            raise ValueError(f"Catalog {identifier}.lag must be an integer within the simulation horizon.")
        _effects(measure.get("full_effects"), indicators, f"{identifier}.full_effects")

    for key in ("global_conflicts", "same_district_conflicts"):
        if not isinstance(rules.get(key), list):
            raise ValueError(f"Catalog rules.{key} must be a list.")
        for pair in rules[key]:
            _pair(pair, measures, key)
            if key == "same_district_conflicts" and any(measures[item]["scope"] != "district" for item in pair):
                raise ValueError("Same-district conflicts must reference district measures.")
    if not isinstance(catalog.get("synergies"), list):
        raise ValueError("Catalog synergies must be a list.")
    seen_synergies = set()
    for synergy in catalog["synergies"]:
        if not isinstance(synergy, dict):
            raise ValueError("Catalog synergies must be objects.")
        pair = synergy.get("pair")
        _pair(pair, measures, "synergy pair")
        source = synergy.get("district_from")
        if source not in pair or measures[source]["scope"] != "district":
            raise ValueError("Catalog synergy district_from must identify a district measure in its pair.")
        key = (tuple(sorted(pair)), source)
        if key in seen_synergies:
            raise ValueError("Catalog synergies must not repeat the same pair and target.")
        seen_synergies.add(key)
        _effects(synergy.get("effects"), indicators, "synergy effects")
    return rules, districts, measures, shares


def _validate_decisions(decisions, rules, districts, measures):
    count = rules["decision_count"]
    if not isinstance(decisions, list) or len(decisions) != count:
        raise SimulationRejected(f"Choose exactly {count} decisions.")
    selected = {}
    directions = Counter()
    for decision in decisions:
        if not isinstance(decision, dict) or set(decision) != {"measure_id", "district_id"}:
            raise SimulationRejected("Each decision needs measure_id and district_id only.")
        measure_id, district_id = decision["measure_id"], decision["district_id"]
        if not isinstance(measure_id, str) or measure_id not in measures:
            raise SimulationRejected("Choose a measure ID from the catalog.")
        if measure_id in selected:
            raise SimulationRejected("Each measure can only be selected once, including across different districts.")
        measure = measures[measure_id]
        if measure["scope"] == "city":
            if district_id is not None:
                raise SimulationRejected("City measures require district_id: null.")
        elif not isinstance(district_id, str) or district_id not in districts:
            raise SimulationRejected("District measures require a district ID from the catalog.")
        selected[measure_id] = district_id
        directions[measure["direction"]] += 1
    if any(count > rules["max_per_direction"] for count in directions.values()):
        raise SimulationRejected(f"Choose at most {rules['max_per_direction']} measures per direction.")
    for first, second in rules["global_conflicts"]:
        if first in selected and second in selected:
            raise SimulationRejected(f"Measures {first} and {second} cannot be selected together.")
    for first, second in rules["same_district_conflicts"]:
        if first in selected and second in selected and selected[first] == selected[second]:
            raise SimulationRejected(f"Measures {first} and {second} cannot target the same district.")
    budget_spent = math.fsum(measures[identifier]["cost"] for identifier in selected)
    if budget_spent > rules["budget"]:
        raise SimulationRejected(f"Selected measures cost {budget_spent:g}; the budget is {rules['budget']:g}.")
    return selected, budget_spent


def _metrics(indicators, shares, threshold):
    scores = {district: math.fsum(values.values()) / len(values) for district, values in indicators.items()}
    weighted = math.fsum(score * shares[district] for district, score in scores.items())
    minimum = min(scores.values())
    critical = [
        {"district_id": district, "indicator_id": indicator, "value": value}
        for district, values in indicators.items()
        for indicator, value in values.items()
        if value < threshold
    ]
    return {
        "score": 0.7 * weighted + 0.3 * minimum - len(critical),
        "district_scores": scores,
        "district_indicators": indicators,
        "weighted_average": weighted,
        "min_district_score": minimum,
        "critical_count": len(critical),
        "critical_indicators": critical,
    }


def simulate(*, decisions):
    """Score five unique measures; return authoritative, JSON-safe game results."""
    catalog = get_catalog()
    rules, districts, measures, shares = _validate_catalog(catalog)
    selected, budget_spent = _validate_decisions(decisions, rules, districts, measures)
    baseline_indicators = {identifier: deepcopy(district["initial_indicators"]) for identifier, district in districts.items()}
    baseline = _metrics(baseline_indicators, shares, rules["critical_threshold_exclusive"])
    # Collect contributions and fsum them once: clamping after each measure would
    # make positive/negative combinations depend on the player's selection order.
    contributions = {district: {indicator: [value] for indicator, value in values.items()} for district, values in baseline_indicators.items()}
    horizon = rules["horizon_quarters"]
    for identifier in sorted(selected):
        measure = measures[identifier]
        targets = districts if measure["scope"] == "city" else [selected[identifier]]
        fraction = (horizon - measure["lag"]) / horizon
        for district in targets:
            for indicator, effect in measure["full_effects"].items():
                contributions[district][indicator].append(effect * fraction)

    applied_synergies = []
    for synergy in catalog["synergies"]:
        if all(identifier in selected for identifier in synergy["pair"]):
            district = selected[synergy["district_from"]]
            for indicator, effect in synergy["effects"].items():
                contributions[district][indicator].append(effect)
            applied_synergies.append({
                "pair": list(synergy["pair"]), "district_id": district,
                "effects": dict(synergy["effects"]),
            })
    final_indicators = {
        district: {indicator: min(100.0, max(0.0, math.fsum(values))) for indicator, values in indicators.items()}
        for district, indicators in contributions.items()
    }
    result = _metrics(final_indicators, shares, rules["critical_threshold_exclusive"])
    return {
        "valid": True,
        **result,
        "budget_spent": budget_spent,
        "budget_remaining": rules["budget"] - budget_spent,
        "baseline": baseline,
        "score_delta": result["score"] - baseline["score"],
        "applied_synergies": applied_synergies,
        "horizon_quarters": horizon,
    }
