"""Adapters for the team's engine and Advisor; no shared mutable chat state."""

import json
import logging
from copy import deepcopy

from django.conf import settings
from django.utils.module_loading import import_string

from .errors import APIError, SimulationRejected

logger = logging.getLogger(__name__)
HISTORY_KEY = "advisor_history"
SIMULATION_KEY = "latest_simulation"
MAX_HISTORY_TURNS = 20
MAX_REPLY_LENGTH = 12000
SIMULATION_PROMPT = "Explain these simulation results and suggest how to improve the decisions."


def _call_provider(setting, validator, **kwargs):
    path = getattr(settings, setting, "")
    if not path:
        raise APIError("service_unavailable", f"{setting} is not configured yet.", 503)
    try:
        provider = import_string(path)
    except Exception as exc:
        logger.exception("Cannot load %s", setting)
        raise APIError("service_unavailable", f"{setting} could not be loaded.", 503) from exc
    try:
        # Providers cannot mutate session state, request decisions, or each other's results.
        value = provider(**deepcopy(kwargs))
        # Require plain JSON, including finite numbers, before saving data in the session.
        value = json.loads(json.dumps(value, allow_nan=False))
        validator(value)
        return value
    except APIError:
        # Trusted adapters may expose actionable configuration and context errors.
        raise
    except SimulationRejected as exc:
        if setting == "GAME_SIMULATION_PROVIDER":
            raise APIError("invalid_decisions", str(exc), 400) from exc
        logger.exception("Unexpected game-rule rejection from %s", setting)
        raise APIError("provider_error", "The requested service failed. Please try again.", 502) from exc
    except Exception as exc:
        logger.exception("Provider failed: %s", setting)
        raise APIError("provider_error", "The requested service failed. Please try again.", 502) from exc


def _validate_catalog(catalog):
    if not isinstance(catalog, dict):
        raise ValueError("Catalog must be an object.")
    for key in ("districts", "measures"):
        if not isinstance(catalog.get(key), list):
            raise ValueError(f"Catalog needs a {key} list.")
        seen = set()
        for item in catalog[key]:
            if not isinstance(item, dict):
                raise ValueError("Catalog entries must be objects.")
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip() or identifier in seen:
                raise ValueError("Catalog IDs must be unique non-empty strings.")
            seen.add(identifier)
            if not isinstance(item.get("name"), str) or not item["name"].strip():
                raise ValueError("Catalog entries need a name.")
            if key == "measures":
                if item.get("scope") not in ("city", "district"):
                    raise ValueError("Measure scope must be city or district.")
                cost = item.get("cost")
                if type(cost) not in (int, float) or cost < 0:
                    raise ValueError("Measure cost must be a non-negative number.")


def _validate_result(result):
    if not isinstance(result, dict):
        raise ValueError("Simulation result must be a JSON object.")


def _validate_reply(reply):
    if not isinstance(reply, str) or not reply.strip() or len(reply) > MAX_REPLY_LENGTH:
        raise ValueError("Advisor must return a non-empty string of at most 12000 characters.")


def get_catalog():
    return _call_provider("GAME_CATALOG_PROVIDER", _validate_catalog)


def run_simulation(decisions):
    return _call_provider("GAME_SIMULATION_PROVIDER", _validate_result, decisions=decisions)


def advisor_reply(session, message):
    history = session.get(HISTORY_KEY, [])[-2 * MAX_HISTORY_TURNS:]
    reply = _call_provider(
        "ADVISOR_REPLY_PROVIDER",
        _validate_reply,
        message=message,
        history=history,
        simulation=session.get(SIMULATION_KEY),
    )
    # Save whole turns only after a successful response; assignment marks the session dirty.
    session[HISTORY_KEY] = (
        history
        + [{"role": "user", "content": message}, {"role": "assistant", "content": reply}]
    )[-2 * MAX_HISTORY_TURNS:]
    return reply
