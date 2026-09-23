# Team API contract

Django hosts the API and calls the engine and Advisor directly in Python.
React sends IDs, decisions, and chat messages. All paths below have **no trailing slash**.

The catalog and Advisor from the logic branch are connected by default. The catalog
works immediately; real chat uses AKIM_AI_PROVIDER=openai and requires OPENAI_API_KEY
and OPENAI_MODEL in the server environment. For an explicitly scripted offline chat,
start the server with AKIM_AI_PROVIDER=demo. Demo replies are labeled in the reply text.

The scoring engine remains the teammate's responsibility. /api/simulate returns
HTTP 503 until GAME_SIMULATION_PROVIDER is configured.

## Connect the team modules

Set these environment variables before starting Django (or set them in settings.py):

| Setting | Example dotted callable path | Python interface |
| --- | --- | --- |
| GAME_CATALOG_PROVIDER | akim_ai.agent.load_catalog (default) | get_catalog() -> dict |
| GAME_SIMULATION_PROVIDER | engine.api.simulate | simulate(*, decisions: list[dict]) -> dict |
| ADVISOR_REPLY_PROVIDER | game_api.integrations.reply (default) | reply(*, message: str, history: list[dict], simulation: dict \| None) -> str |

Catalog and Advisor paths above are working defaults. The engine path is an example.
Django does not automatically load a .env file.

The catalog provider must return the structure below, using the team's agreed IDs.
The engine receives five validated decisions and must enforce game rules such as
budget and incompatible measures. For a game-rule violation, raise
game_api.errors.SimulationRejected("Player-facing explanation"); Django returns
HTTP 400 with code invalid_decisions and preserves the previous run.
Its result must be a plain JSON object with finite numbers. The connected Advisor
requires valid: true and a finite numeric score; the API does not invent either.
Additional result fields are preserved. The real catalog also forbids repeating a
measure across districts, limits each direction to two measures, and defines budget
and conflict rules. The engine must enforce these before returning valid: true.

The Advisor receives:
- message: the current question, separate from history;
- history: previous successful user/assistant messages, oldest first;
- simulation: null before the first calculation, otherwise
  {"decisions": [...], "result": {...}} from Django's engine call.

The connected adapter creates a new Advisor/model for each request, passes session
history separately from the question, and formats its validated briefing as reply.
It does not use file memory or a shared global conversation. The existing message-only
HTTP contract is unchanged; structured candidate planning remains available through
the library and CLI with suggest=true (see [Advisor guide](advisor.md)).
Replies are limited to 12,000 characters. A longer formatted briefing is truncated.
AI failures return JSON errors without appending partial conversation turns.

Django stores the most recent simulation and last 20 successful conversation turns
in database-backed sessions. A session cookie identifies an anonymous player; tabs
sharing that cookie share a player. A successful new simulation clears the old
conversation and starts it with an automatic explanation. An engine failure leaves
the previous run intact. Failed AI calls do not append partial turns.
React should allow one simulation/chat request at a time per player to preserve
message order; session writes do not serialize overlapping requests.

## GET /api/catalog

Returns HTTP 200 and sets the csrftoken cookie for subsequent POST requests.
Excerpt from the connected catalog (the full response includes all 5 districts,
14 measures, indicators, rules, and synergies):

```json
{
  "districts": [
    {
      "id": "SARYARKA",
      "name": "Сарыарка"
    },
    {
      "id": "NURA",
      "name": "Нура"
    }
  ],
  "measures": [
    {
      "id": "M5",
      "name": "Перевод частного сектора на чистое топливо",
      "cost": 25,
      "scope": "district"
    },
    {
      "id": "M7",
      "name": "Школа + детсад (модульное строительство)",
      "cost": 24,
      "scope": "district"
    },
    {
      "id": "M8",
      "name": "Центр семейного здоровья / поликлиника",
      "cost": 20,
      "scope": "district"
    },
    {
      "id": "M10",
      "name": "Освещение и камеры (расширение Safe City)",
      "cost": 12,
      "scope": "district"
    },
    {
      "id": "M12",
      "name": "Единая цифровая платформа обращений",
      "cost": 14,
      "scope": "city"
    }
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
    {
      "measure_id": "M7",
      "district_id": "NURA"
    },
    {
      "measure_id": "M8",
      "district_id": "NURA"
    },
    {
      "measure_id": "M10",
      "district_id": "NURA"
    },
    {
      "measure_id": "M12",
      "district_id": null
    },
    {
      "measure_id": "M5",
      "district_id": "SARYARKA"
    }
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
