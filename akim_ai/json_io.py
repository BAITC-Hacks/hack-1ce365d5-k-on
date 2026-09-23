"""Bounded, strict JSON input shared by files and network responses."""
import json
import math


def _reject_constant(value):
    raise ValueError("JSON содержит недопустимое число.")


def _finite_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("JSON содержит недопустимое число.")
    return number


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON содержит повторяющееся поле.")
        result[key] = value
    return result


def loads(text):
    try:
        return json.loads(text, parse_constant=_reject_constant, parse_float=_finite_float,
                          object_pairs_hook=_unique_object)
    except (UnicodeError, RecursionError) as exc:
        raise ValueError("Некорректный JSON.") from exc


def read_json(stream, maximum=1_000_000):
    data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("JSON превышает допустимый размер.")
    return loads(data)
