# hack-1ce365d5-k-on
Hackathon team repository for K-On!

Curently choosed "Спец-трек Astana Innovations"
Roles:
Erasyl: Engine
Temirlan: Ai logic
Miras: Designer

## Django API

Implemented routes:

- GET /api/catalog
- POST /api/simulate
- POST /api/advisor/chat

See [the API contract and React integration guide](docs/api.md) for JSON examples,
CSRF/session handling, and the Python interfaces for the engine and Advisor.
Those team modules still need to be connected through the three provider settings;
the API returns explicit errors until they are configured.

Run locally (Python 3.12+):

```bash
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

If using the existing virtual environment, prefix Python commands with .venv/bin/.
Apply migrations before using chat, because each player's state lives in Django
database sessions.

Run API tests:

```bash
python manage.py test game_api
```
