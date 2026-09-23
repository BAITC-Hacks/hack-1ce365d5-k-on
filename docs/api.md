# Team API contract

Django hosts the API and calls the engine and Advisor directly in Python.
React sends IDs, decisions, and chat messages. All paths below have **no trailing slash**.

The engine, real catalog, and Advisor are not in this repository yet. Configure their
callables to enable the corresponding routes. Unconfigured services return JSON
with HTTP 503; there is no placeholder score or generated advice.

## Connect the team modules

Set these environment variables before starting Django (or set them in settings.py):

| Setting | Example dotted callable path | Python interface |
| --- | --- | --- |
| GAME_CATALOG_PROVIDER | engine.api.get_catalog | get_catalog() -> dict |
| GAME_SIMULATION_PROVIDER | engine.api.simulate | simulate(*, decisions: list[dict]) -> dict |
| ADVISOR_REPLY_PROVIDER | advisor.api.reply | reply(*, message: str, history: list[dict], simulation: dict \| None) -> str |

The dotted paths are examples; point them at your real modules.
Django does not automatically load a .env file.

The catalog provider must return the structure below, using the team's agreed IDs.
The engine receives five validated decisions and must enforce game rules such as
budget and incompatible measures. For a game-rule violation, raise
game_api.errors.SimulationRejected("Player-facing explanation"); Django returns
HTTP 400 with code invalid_decisions and preserves the previous run.
Its result must be a plain JSON object with
finite numbers. The API preserves its fields; agree the actual score/result schema
with the engine and React teammates.

The Advisor receives:
- message: the current question, separate from history;
- history: previous successful user/assistant messages, oldest first;
- simulation: null before the first calculation, otherwise
  {"decisions": [...], "result": {...}} from Django's engine call.

Its return value is a non-empty string, at most 12,000 characters.
Adapt the existing Advisor behind this function. Disable its terminal file memory:
use the supplied history and simulation. Do not reuse a mutable global Advisor
conversation or save all players into one local file. AI provider timeouts and
credentials belong in that adapter.

Django stores the most recent simulation and last 20 successful conversation turns
in database-backed sessions. A session cookie identifies an anonymous player; tabs
sharing that cookie share a player. A successful new simulation clears the old
conversation and starts it with an automatic explanation. An engine failure leaves
the previous run intact. Failed AI calls do not append partial turns.
React should allow one simulation/chat request at a time per player to preserve
message order; session writes do not serialize overlapping requests.

## GET /api/catalog

Returns HTTP 200 and sets the csrftoken cookie for subsequent POST requests.
Example shape (illustrative IDs, names, and prices; replace with the real catalog):

```json
{
  "districts": [{"id": "SARYARKA", "name": "Сарыарка"}],
  "measures": [
    {"id": "M1", "name": "Мера 1", "cost": 100, "scope": "district"},
    {"id": "M2", "name": "Мера 2", "cost": 200, "scope": "district"},
    {"id": "M3", "name": "Мера 3", "cost": 300, "scope": "district"},
    {"id": "M4", "name": "Городская мера", "cost": 400, "scope": "city"},
    {"id": "M5", "name": "Мера 5", "cost": 500, "scope": "district"}
  ]
}
```

IDs must be unique within each list, names non-empty, and costs non-negative.
Extra catalog metadata is preserved. The same catalog validates simulation input.

## POST /api/simulate

Request:

```json
{
  "decisions": [
    {"measure_id": "M1", "district_id": "SARYARKA"},
    {"measure_id": "M2", "district_id": "SARYARKA"},
    {"measure_id": "M3", "district_id": "SARYARKA"},
    {"measure_id": "M4", "district_id": null},
    {"measure_id": "M5", "district_id": "SARYARKA"}
  ]
}
```

Exactly five distinct measure/district pairs are required. District measures use a
catalog district ID; city measures require an explicit null. Display names, prices,
scores, and other client-supplied result fields are rejected.

Django calculates the result, saves it for this player, then calls the Advisor.
Response shape (the decisions array contains all five submitted choices):

```text
{
  "simulation": {
    "decisions": [the five validated decisions],
    "result": {the engine's JSON result, unchanged}
  },
  "advisor": {"reply": "The Advisor's explanation"}
}
```

If the Advisor fails, a valid simulation still returns HTTP 200, with:

```json
{
  "reply": null,
  "error": {"code": "provider_error", "message": "The requested service failed. Please try again."}
}
```

That object is the advisor field. The simulation remains available for subsequent
chat requests. A missing Advisor instead uses code service_unavailable.

## POST /api/advisor/chat

Request:

```json
{"message": "Как улучшить результат в Сарыарке?"}
```

Response:

```json
{"reply": "The Advisor's answer"}
```

Only message is accepted, with 1–4,000 characters after excluding an all-whitespace
message (the length limit applies before trimming). Django supplies conversation
history and the latest authoritative simulation. Chat also works before simulation.
Never send score, history, simulation, or a player/session ID in the request body.

## React integration

Serve React and /api on the same origin. During development, configure the React
dev server to proxy /api to http://127.0.0.1:8000. For example, merge this into the
existing Vite configuration:

```js
server: {
  proxy: {
    "/api": { target: "http://127.0.0.1:8000", changeOrigin: false }
  }
}
```

Keep changeOrigin: false so Django sees the original Host and Origin.
Call relative /api URLs through the dev server. No CORS dependency is needed for
this setup. See [Vite's proxy options](https://vite.dev/config/server-options#server-proxy).
Start with GET /api/catalog, then send credentials and the CSRF header:

```js
await fetch("/api/catalog", { credentials: "same-origin" });

function csrfToken() {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="));
  return cookie ? decodeURIComponent(cookie.slice("csrftoken=".length)) : "";
}

async function postApi(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken(),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error.message);
  return data;
}

const { reply } = await postApi("/api/advisor/chat", {
  message: "Как улучшить результат?",
});
```

The catalog route sets a CSRF cookie even while the catalog module is unconfigured,
so Advisor development can proceed independently.
CSRF protection follows [Django's AJAX guidance](https://docs.djangoproject.com/en/6.1/howto/csrf/).
Player storage uses [Django database-backed sessions](https://docs.djangoproject.com/en/6.1/topics/http/sessions/).

## Errors

API errors use {"error": {"code": "...", "message": "..."}}.

| HTTP status | Meaning |
| --- | --- |
| 400 | Invalid JSON, fields, message, IDs, or decisions |
| 403 | Missing/invalid CSRF token |
| 405 | Wrong HTTP method; see Allow header |
| 413 | Request body exceeds 64 KiB |
| 415 | Content-Type must be application/json |
| 502 | Connected provider failed or returned invalid data |
| 503 | A team module has not been configured or could not be imported |

Unexpected provider details stay in server logs. HTTP 200 from /api/simulate can
include advisor.error; always inspect that field before displaying the explanation.
