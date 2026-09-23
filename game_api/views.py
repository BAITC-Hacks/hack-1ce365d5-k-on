from functools import wraps

from django.http import JsonResponse
from django.views.csrf import csrf_failure as default_csrf_failure
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie

from . import services
from .errors import APIError
from .validation import read_json, validate_decisions, validate_message


def api_endpoint(method):
    def decorator(view):
        @wraps(view)
        @never_cache
        def wrapped(request):
            if request.method != method:
                response = JsonResponse(
                    {"error": {"code": "method_not_allowed", "message": f"Use {method}."}},
                    status=405,
                )
                response["Allow"] = method
                return response
            try:
                return JsonResponse(view(request), json_dumps_params={"ensure_ascii": False})
            except APIError as exc:
                return JsonResponse({"error": exc.as_dict()}, status=exc.status)
        return wrapped
    return decorator


@ensure_csrf_cookie
@api_endpoint("GET")
def catalog(request):
    return services.get_catalog()


@api_endpoint("POST")
def simulate(request):
    data = read_json(request, ("decisions",))
    decisions = validate_decisions(data["decisions"], services.get_catalog())
    result = services.run_simulation(decisions)
    simulation = {"decisions": decisions, "result": result}
    request.session[services.SIMULATION_KEY] = simulation
    # A new run starts a new conversation so old advice does not describe the wrong run.
    request.session[services.HISTORY_KEY] = []
    try:
        advisor = {"reply": services.advisor_reply(request.session, services.SIMULATION_PROMPT)}
    except APIError as exc:
        # Keep a valid engine result even when the AI is unavailable. Chat can retry later.
        advisor = {"reply": None, "error": exc.as_dict()}
    return {"simulation": simulation, "advisor": advisor}


@api_endpoint("POST")
def chat(request):
    data = read_json(request, ("message",))
    message = validate_message(data["message"])
    return {"reply": services.advisor_reply(request.session, message)}


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/"):
        return JsonResponse(
            {"error": {
                "code": "csrf_failed",
                "message": "Get /api/catalog, then send its CSRF cookie in X-CSRFToken.",
            }},
            status=403,
        )
    return default_csrf_failure(request, reason=reason)
