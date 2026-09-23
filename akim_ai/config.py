"""Minimal dotenv reader: only explicit known keys, no shell evaluation."""
import os
from pathlib import Path


def load_env(path=".env"):
    path = Path(path)
    if not path.exists():
        return
    values = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key.strip() not in {"OPENAI_API_KEY", "OPENAI_MODEL"}:
            raise ValueError(f"Некорректная настройка .env в строке {number}.")
        value = value.strip()
        if value.startswith(('"', "'")):
            if len(value) < 2 or value[-1] != value[0]:
                raise ValueError(f"Незакрытые кавычки .env в строке {number}.")
            value = value[1:-1]
        values[key.strip()] = value
    for key, value in values.items():
        os.environ.setdefault(key, value)
