import json

from django.core.exceptions import RequestDataTooBig

from .errors import APIError

MAX_BODY_BYTES = 64 * 1024
MAX_MESSAGE_LENGTH = 4000


def _reject_constant(value):
    raise ValueError(f"Invalid JSON constant: {value}")


def read_json(request, fields):
    if request.content_type != "application/json":
        raise APIError("unsupported_media_type", "Use Content-Type: application/json.", 415)
    try:
        body = request.body
    except RequestDataTooBig as exc:
        raise APIError("payload_too_large", "Request body is too large.", 413) from exc
    if len(body) > MAX_BODY_BYTES:
        raise APIError("payload_too_large", "Request body is too large.", 413)
    try:
        data = json.loads(body.decode("utf-8"), parse_constant=_reject_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise APIError("invalid_json", "Send a valid UTF-8 JSON object.") from exc
    if not isinstance(data, dict) or set(data) != set(fields):
        raise APIError("invalid_fields", f"Send exactly these fields: {', '.join(fields)}.")
    return data


def validate_message(message):
    if not isinstance(message, str) or not message.strip():
        raise APIError("invalid_message", "message must be a non-empty string.")
    if len(message) > MAX_MESSAGE_LENGTH:
        raise APIError("invalid_message", f"message must be at most {MAX_MESSAGE_LENGTH} characters.")
    return message.strip()


def validate_decisions(decisions, catalog):
    if not isinstance(decisions, list) or len(decisions) != 5:
        raise APIError("invalid_decisions", "Choose exactly five decisions.")
    districts = {item["id"] for item in catalog["districts"]}
    measures = {item["id"]: item for item in catalog["measures"]}
    seen = set()
    for decision in decisions:
        if not isinstance(decision, dict) or set(decision) != {"measure_id", "district_id"}:
            raise APIError("invalid_decision", "Each decision needs measure_id and district_id only.")
        measure_id, district_id = decision["measure_id"], decision["district_id"]
        if not isinstance(measure_id, str) or measure_id not in measures:
            raise APIError("unknown_measure", "measure_id must match an ID in the catalog.")
        if measures[measure_id]["scope"] == "city":
            if district_id is not None:
                raise APIError("invalid_district", "City measures require district_id: null.")
        elif not isinstance(district_id, str) or district_id not in districts:
            raise APIError("invalid_district", "District measures require an ID from the catalog.")
        pair = (measure_id, district_id)
        if pair in seen:
            raise APIError("duplicate_decision", "The same measure and district cannot be chosen twice.")
        seen.add(pair)
    return decisions
