# Аким на 5 часов — K-On!

Hackathon team repository for «Спец-трек Astana Innovations».

- Erasyl: engine and Django API
- Temirlan: AI logic
- Miras: design and React

The `design` branch's React/Vite app is connected to the Django catalog, scoring
engine, and Advisor. Build a five-initiative plan, calculate its impact on Astana's
five districts, and discuss the server's results with the Advisor.

## Run the app

Use Python 3.12+ and Node.js 22.18+ (Node 24 LTS recommended).

In this prepared checkout, dependencies and a local Node runtime are installed.
Start both servers with `./scripts/dev.sh`, then open `http://127.0.0.1:5173`.
Press Ctrl-C to stop them. The launcher reuses a Django API already running at the configured target
(default port 8000); restart that backend after changing Python code or `.env`. For a fresh checkout, follow the setup below first.

Backend, in one terminal:

```bash
python -m pip install -r requirements.txt
# For a new checkout only: copy .env.example to .env and fill in your settings.
python manage.py migrate
python manage.py runserver
```

Use `.venv/bin/python` if the virtual environment is not activated. Django loads
`.env` automatically; existing process environment variables take precedence.
The built-in scoring engine works without credentials. For real AI replies, set
`AKIM_AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` in `.env`.
No model is selected automatically. Missing AI configuration leaves simulation
results available and displays an Advisor error. The OpenAI request timeout is
45 seconds.

For explicitly scripted offline replies, run the backend with:

```bash
AKIM_AI_PROVIDER=demo python manage.py runserver
```

Frontend, in a second terminal:

```bash
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). Vite proxies
relative `/api` requests to Django at `http://127.0.0.1:8000`, preserving cookies
and CSRF protection. Set `DJANGO_API_TARGET` in `.env` or the frontend process
environment if Django runs elsewhere. API keys stay on the server; do not prefix
secrets with `VITE_`.

`npm run build` produces `dist/`. `npm run preview` previews that build with the
same API proxy while Django is running. For deployment, serve `dist/` and route
`/api` to Django under the same origin. Vite preview and Django runserver are
local development tools.

## Connected routes

- `GET /api/catalog`: district indicators, initiatives, costs, and game rules.
- `POST /api/simulate`: validates the plan, runs `game_api.engine.simulate`, saves
  the trusted result in the player's session, and requests an Advisor briefing.
- `POST /api/advisor/chat`: calls `akim_ai.Advisor` using that player's latest
  simulation and chat history. Chat also works before a simulation.

The engine enforces budget, exactly five unique initiatives, at most two per
direction, and incompatible combinations. Effects use the catalog's time lag;
synergies and critical indicators contribute to the final score. See the
[calculation rules and assumptions](docs/engine.md),
[API contract](docs/api.md), and [Advisor guide](docs/advisor.md).
The original design PNG remains in the repository as a visual reference.

## Checks

```bash
python manage.py test
npm test
npm run lint
npm run build
```

Tests cover engine calculations and rules, API sessions/CSRF, Advisor integration,
`.env` precedence, and frontend requests/validation without paid AI calls.

The standalone Advisor CLI is also available; it reads process environment
variables rather than `.env`:

```bash
python -m akim_ai --provider demo --input examples/request.json
```
