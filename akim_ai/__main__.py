import argparse
import json
from pathlib import Path
import sys

from .agent import Advisor
from .providers import DemoModel, OpenAIModel


def main():
    parser = argparse.ArgumentParser(description="AI-советник акима")
    parser.add_argument("--provider", choices=["demo", "openai"], required=True)
    parser.add_argument("--input", type=Path, default=Path("examples/request.json"))
    args = parser.parse_args()
    try:
        request = json.loads(args.input.read_text(encoding="utf-8"))
        if not isinstance(request, dict) or set(request) - {"question", "decisions", "suggest"}:
            raise ValueError("Ожидаются поля question, decisions, suggest.")
        if type(request.get("suggest", False)) is not bool:
            raise ValueError("suggest должен быть true или false.")
        model = DemoModel() if args.provider == "demo" else OpenAIModel()
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
