"""Connect the merged Advisor to Django's existing string-reply contract."""

from django.conf import settings

from akim_ai import Advisor
from akim_ai.providers import DemoModel, OpenAIModel

from .errors import APIError
from .services import MAX_REPLY_LENGTH, get_catalog

DEMO_NOTICE = "ДЕМО: заранее написанный ответ, настоящая модель не вызывается."


def _model():
    provider = settings.AKIM_AI_PROVIDER
    if provider == "demo":
        return DemoModel()
    if provider == "openai":
        try:
            return OpenAIModel()
        except ValueError as exc:
            raise APIError(
                "service_unavailable",
                "Set OPENAI_API_KEY and OPENAI_MODEL for AI replies, or explicitly use AKIM_AI_PROVIDER=demo.",
                503,
            ) from exc
    raise APIError("service_unavailable", "AKIM_AI_PROVIDER must be openai or demo.", 503)


def _format_briefing(briefing):
    parts = [briefing["summary"]["text"]]
    for field, title in (("strengths", "Преимущества"), ("risks", "Риски")):
        statements = [item["text"] for item in briefing[field] if item["text"].strip()]
        if statements:
            parts.append(title + ":\n" + "\n".join("- " + text for text in statements))
    if briefing["next_step"].strip():
        parts.append("Следующий шаг: " + briefing["next_step"])
    return "\n\n".join(part for part in parts if part.strip())


def reply(*, message, history, simulation):
    # Fresh instances for every request; history comes only from this player's session.
    model = _model()
    decisions, result = [], None
    if simulation is not None:
        if not isinstance(simulation, dict) or not {"decisions", "result"} <= simulation.keys():
            raise APIError("invalid_simulation", "The stored simulation has an invalid shape.", 502)
        decisions, result = simulation["decisions"], simulation["result"]
        if result is None:
            raise APIError("invalid_simulation", "The stored simulation has no engine result.", 502)
    answer = Advisor(model, catalog=get_catalog()).run(
        message, decisions, history=history, simulation=result,
    )
    if answer["status"] == "invalid_simulation":
        raise APIError("invalid_simulation", "The engine must return valid: true and a finite numeric score.", 502)
    if answer["status"] == "invalid_input":
        raise APIError("invalid_advisor_context", "The stored decisions or history do not match the Advisor contract.", 502)
    if answer["status"] != "ok" or answer["briefing"] is None:
        raise APIError("provider_error", "The Advisor is unavailable. Please try again.", 502)
    text = _format_briefing(answer["briefing"])
    if not text:
        raise APIError("provider_error", "The Advisor returned an empty reply.", 502)
    if settings.AKIM_AI_PROVIDER == "demo":
        text = DEMO_NOTICE + "\n\n" + text
    if len(text) > MAX_REPLY_LENGTH:
        text = text[:MAX_REPLY_LENGTH - 1].rstrip() + "…"
    return text
