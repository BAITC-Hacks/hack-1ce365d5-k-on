"""Small JSON-schema subset shared by remote and offline model adapters."""
import math


def obj(properties):
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


def array(items, maximum=10):
    return {"type": "array", "items": items, "maxItems": maximum}


TEXT = {"type": "string", "maxLength": 1500}
DECISION = obj({
    "measure_id": {"type": "string", "enum": [f"M{i}" for i in range(1, 15)]},
    "district_id": {"type": ["string", "null"], "enum": [
        "ESIL", "ALMATY", "SARYARKA", "BAIKONUR", "NURA", None]},
})
FIVE_DECISIONS = {**array(DECISION, 5), "minItems": 5}
PLAN = obj({"candidates": array(obj({
    "reason": TEXT, "decisions": FIVE_DECISIONS,
}), 3)})
STATEMENT = obj({"text": TEXT, "evidence_ids": array({"type": "string"}, 12)})
BRIEF = obj({"summary": STATEMENT, "strengths": array(STATEMENT, 3),
             "risks": array(STATEMENT, 3), "next_step": TEXT})


def validate(value, schema, path="$"):
    """Validate exactly the subset used above, including offline responses."""
    kind = schema["type"]
    kinds = kind if isinstance(kind, list) else [kind]
    matches = {"null": value is None, "string": isinstance(value, str),
               "object": isinstance(value, dict), "array": isinstance(value, list)}
    if not any(matches.get(k, False) for k in kinds):
        raise ValueError(f"{path}: wrong type")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{path}: unknown value")
    if isinstance(value, dict):
        if set(value) != set(schema["properties"]):
            raise ValueError(f"{path}: unexpected or missing fields")
        for key, sub in schema["properties"].items():
            validate(value[key], sub, f"{path}.{key}")
    elif isinstance(value, list):
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", 100):
            raise ValueError(f"{path}: wrong length")
        for i, item in enumerate(value):
            validate(item, schema["items"], f"{path}[{i}]")
    elif isinstance(value, str) and len(value) > schema.get("maxLength", 10000):
        raise ValueError(f"{path}: text too long")


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)
