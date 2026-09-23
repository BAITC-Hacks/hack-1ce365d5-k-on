import argparse
import json
from pathlib import Path
import sys

from .agent import Advisor
from .providers import DemoModel, OpenAIModel
from .config import load_env
from .chat import run_chat
from .json_io import read_json


def main():
    parser = argparse.ArgumentParser(description="AI-советник акима")
    parser.add_argument("--provider", choices=["demo", "openai"], required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--input", type=Path, help="JSON-файл запроса; '-' для stdin")
    mode.add_argument("--chat", action="store_true", help="Интерактивный диалог с памятью")
    parser.add_argument("--session", type=Path, help="Файл памяти; по умолчанию .sessions/<provider>.json")
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    mode.add_argument("--check-config", action="store_true", help="Проверить настройки без запроса к API")
    args = parser.parse_args()
    try:
        if args.provider == "openai":
            load_env(args.env_file)
        model = DemoModel() if args.provider == "demo" else OpenAIModel()
        if args.check_config:
            print("Настройки прочитаны. Доступность модели и ключа через API ещё не проверена.")
            return 0
        if args.chat:
            path = args.session or Path(".sessions") / f"{args.provider}.json"
            return run_chat(Advisor(model), path, args.provider)
        input_path = args.input or Path("examples/request.json")
        if str(input_path) == "-":
            request = read_json(sys.stdin.buffer)
        else:
            with input_path.open("rb") as handle:
                request = read_json(handle)
        if (not isinstance(request, dict) or "question" not in request
                or set(request) - {"question", "decisions", "suggest"}):
            raise ValueError("Ожидаются поля question, decisions, suggest.")
        if type(request.get("suggest", False)) is not bool:
            raise ValueError("suggest должен быть true или false.")
        result = Advisor(model).run(**request)
        result["provider"] = args.provider
        if args.provider == "demo":
            result["warnings"].insert(0, "ДЕМО: заранее написанный ответ, настоящая модель не вызывается.")
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0 if result["status"] == "ok" else 1
    except (OSError, ValueError, TypeError) as exc:
        print(f"Ошибка запуска: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
