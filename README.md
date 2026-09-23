# Аким на 5 часов — K-On!

Hackathon team repository for «Спец-трек Astana Innovations».

- Erasyl: engine and Django API
- Temirlan: AI logic
- Miras: design and React

## Run Django

Python 3.12+ is required.

```bash
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Use `.venv/bin/python` if the virtual environment is not activated.

## Connected routes

- `GET /api/catalog` serves the real catalog from `akim_ai/catalog.json`.
- `POST /api/advisor/chat` calls the merged `akim_ai.Advisor`, with each player's
  history and latest trusted simulation supplied by Django's database session.
- `POST /api/simulate` is ready for the teammate's engine. No scoring engine is
  included; this route returns 503 until `GAME_SIMULATION_PROVIDER` is configured.

For real AI replies, set `AKIM_AI_PROVIDER=openai` (the default), `OPENAI_API_KEY`,
and `OPENAI_MODEL` in the server's environment. No model is selected automatically,
and missing credentials produce a clear 503 response. The existing OpenAI adapter
has a 45-second network timeout.

To check the complete chat route without credentials or network calls:

```bash
AKIM_AI_PROVIDER=demo python manage.py runserver
```

Demo replies explicitly identify themselves as scripted examples; they do not
understand arbitrary questions. The `.env.example` file lists settings, but
Django and the CLI do not automatically read `.env`.

See [the API contract and React examples](docs/api.md) for request bodies and CSRF.
The [Advisor guide](docs/advisor.md) preserves the logic branch's CLI instructions,
structured responses, and planning workflow.

## Tests

```bash
python manage.py test
```

This runs both API integration tests and the Advisor's unit tests without paid API
calls. The standalone CLI remains available:

```bash
python -m akim_ai --provider demo --input examples/request.json
```
