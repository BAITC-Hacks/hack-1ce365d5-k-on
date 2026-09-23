"""Compare briefing JSON bytes with the original duplicated payload format."""
from copy import deepcopy
import json

from akim_ai import Advisor
from akim_ai.providers import DemoModel


class Recorder(DemoModel):
    def generate(self, stage, instructions, payload, schema):
        if stage == "brief":
            self.payload = deepcopy(payload)
        return super().generate(stage, instructions, payload, schema)


def main():
    model = Recorder()
    result = Advisor(model).run("Предложи меры для Нуры", suggest=True)
    previous = {**model.payload, "checks": result["candidates"]}
    before = len(json.dumps(previous, ensure_ascii=False).encode("utf-8"))
    after = len(json.dumps(model.payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    print(json.dumps({"baseline_payload_bytes": before, "optimized_payload_bytes": after,
                      "reduction_percent": round(100 * (1 - after / before), 2)}, indent=2))


if __name__ == "__main__":
    main()
