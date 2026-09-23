"""Optional real API adapter and an explicitly scripted offline demonstration."""
import json
import os
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .json_io import loads, read_json


class ModelError(RuntimeError):
    MESSAGES = {
        "auth": "OpenAI: проверьте API-ключ и доступ к модели.",
        "limit": "OpenAI: достигнут лимит запросов или доступного бюджета API.",
        "request": "OpenAI отклонил запрос. Проверьте название модели и поддержку JSON Schema.",
        "network": "Не удалось связаться с OpenAI. Проверьте подключение к сети.",
        "timeout": "OpenAI не ответил вовремя. Попробуйте ещё раз.",
        "service": "Сервис OpenAI временно недоступен.",
        "response": "OpenAI вернул неполный или некорректный ответ.",
        "refusal": "Модель отказалась отвечать на этот запрос. Попробуйте переформулировать его.",
    }

    def __init__(self, code):
        self.public_message = self.MESSAGES[code]
        super().__init__(code)


class OpenAIModel:
    def __init__(self):
        self.key = os.environ.get("OPENAI_API_KEY", "").strip()
        self.model = os.environ.get("OPENAI_MODEL", "").strip()
        if not self.key or not self.model:
            raise ValueError("Задайте OPENAI_API_KEY и OPENAI_MODEL в окружении.")

    def generate(self, stage, instructions, payload, schema):
        body = {"model": self.model, "instructions": instructions,
                "input": [{"role": "user", "content": json.dumps(
                    payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)}],
                "store": False, "max_output_tokens": 6000,
                "text": {"format": {"type": "json_schema", "name": f"akim_{stage}",
                                    "strict": True, "schema": schema}}}
        request = Request("https://api.openai.com/v1/responses",
                          data=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode(), method="POST",
                          headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=45) as response:
                result = read_json(response, maximum=2_000_000)
        except HTTPError as exc:
            code = ("auth" if exc.code in (401, 403) else "limit" if exc.code == 429
                    else "service" if exc.code >= 500 else "request")
            exc.close()
            raise ModelError(code) from None
        except TimeoutError:
            raise ModelError("timeout") from None
        except URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                raise ModelError("timeout") from None
            raise ModelError("network") from None
        except (OSError, HTTPException):
            raise ModelError("network") from None
        except (ValueError, UnicodeError):
            raise ModelError("response") from None
        if not isinstance(result, dict):
            raise ModelError("response")
        if result.get("status") != "completed":
            raise ModelError("response")
        output = result.get("output")
        if not isinstance(output, list):
            raise ModelError("response")
        parts = []
        for item in output:
            if not isinstance(item, dict):
                raise ModelError("response")
            if item.get("type") == "message":
                content = item.get("content")
                if not isinstance(content, list) or any(not isinstance(p, dict) for p in content):
                    raise ModelError("response")
                parts.extend(content)
        if any(p.get("type") == "refusal" for p in parts):
            raise ModelError("refusal")
        texts = [p.get("text") for p in parts if p.get("type") == "output_text"]
        if not texts or any(not isinstance(t, str) for t in texts):
            raise ModelError("response")
        try:
            parsed = loads("".join(texts))
            if not isinstance(parsed, dict):
                raise ValueError("Expected an object")
            return parsed
        except ValueError:
            raise ModelError("response") from None


class DemoModel:
    """Fixed example only: does not understand arbitrary questions and is not an LLM."""
    def generate(self, stage, instructions, payload, schema):
        if stage == "plan":
            return {"candidates": [{"reason": "Гипотеза: поддержать соцсферу Нуры и воздух Сарыарки.",
                "decisions": [
                    {"measure_id": "M7", "district_id": "NURA"},
                    {"measure_id": "M8", "district_id": "NURA"},
                    {"measure_id": "M10", "district_id": "NURA"},
                    {"measure_id": "M12", "district_id": None},
                    {"measure_id": "M5", "district_id": "SARYARKA"}]}]}
        return {"summary": {"text": "Демонстрационный ответ: M5 — перевод частных домов на чистое топливо. Лаг означает задержку до начала эффекта.", "evidence_ids": ["M5", "rules"]},
                "strengths": [{"text": "По каталогу мера направлена на улучшение качества воздуха и надёжности ЖКХ выбранного района.", "evidence_ids": ["M5"]}],
                "risks": [{"text": "Эффект проявляется с задержкой. Изменения итогового балла пока не рассчитаны.", "evidence_ids": ["M5", "rules"]}],
                "next_step": "Выберите район; для оценки результата понадобится расчёт полного набора мер."}
