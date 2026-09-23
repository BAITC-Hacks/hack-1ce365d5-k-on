"""Optional real API adapter and an explicitly scripted offline demonstration."""
import json
import os
from urllib.request import Request, urlopen


class OpenAIModel:
    def __init__(self):
        self.key = os.environ.get("OPENAI_API_KEY", "")
        self.model = os.environ.get("OPENAI_MODEL", "")
        if not self.key or not self.model:
            raise ValueError("Задайте OPENAI_API_KEY и OPENAI_MODEL в окружении.")

    def generate(self, stage, instructions, payload, schema):
        body = {"model": self.model, "instructions": instructions,
                "input": [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                "store": False, "max_output_tokens": 6000,
                "text": {"format": {"type": "json_schema", "name": f"akim_{stage}",
                                    "strict": True, "schema": schema}}}
        request = Request("https://api.openai.com/v1/responses",
                          data=json.dumps(body).encode(), method="POST",
                          headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        with urlopen(request, timeout=45) as response:
            result = json.load(response)
        if result.get("status") != "completed":
            raise ValueError("Incomplete model response")
        parts = [part for item in result.get("output", []) if item.get("type") == "message"
                 for part in item.get("content", [])]
        if any(p.get("type") == "refusal" for p in parts):
            raise ValueError("Model refused")
        text = "".join(p.get("text", "") for p in parts if p.get("type") == "output_text")
        return json.loads(text)


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
