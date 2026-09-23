"""Local conversation state: explicit priorities and decisions, bounded transcript."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import tempfile

from .agent import check_selection, load_catalog
from .contracts import CONVERSATION, DECISION, array, obj, validate
from .json_io import loads


SESSION_SCHEMA = obj({
    "version": {"type": "string", "enum": ["1"]},
    "decisions": array(DECISION, 5),
    "conversation": CONVERSATION,
})
MAX_HISTORY_CHARS = 24000


class ChatSession:
    def __init__(self):
        self.decisions = []
        self.conversation = {"priority": "", "history": [], "previous_candidates": []}
        self._revisions = {}

    def reset(self):
        """Clear conversation while preserving the loaded file revision."""
        self.decisions = []
        self.conversation = {"priority": "", "history": [], "previous_candidates": []}

    @staticmethod
    def _validate(data, catalog):
        validate(data, SESSION_SCHEMA)
        history = data["conversation"]["history"]
        if len(history) % 2 or any(
            m["role"] != ("user" if i % 2 == 0 else "assistant")
            for i, m in enumerate(history)
        ):
            raise ValueError("Invalid history order")
        if sum(len(m["content"]) for m in history) > MAX_HISTORY_CHARS:
            raise ValueError("History is too long")
        if check_selection(data["decisions"], catalog, complete=False):
            raise ValueError("Invalid decisions")
        candidates = data["conversation"]["previous_candidates"]
        if len({c["id"] for c in candidates}) != len(candidates):
            raise ValueError("Duplicate candidate IDs")
        if any(check_selection(c["decisions"], catalog) for c in candidates):
            raise ValueError("Invalid candidate")

    @classmethod
    def load(cls, path):
        path = Path(path)
        session = cls()
        if not path.exists():
            return session
        if path.stat().st_size > 1_000_000:
            raise ValueError("Файл диалога слишком большой.")
        try:
            with path.open("rb") as handle:
                raw = handle.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError("Session too large")
            data = loads(raw)
            cls._validate(data, load_catalog())
        except (ValueError, TypeError):
            raise ValueError("Файл диалога повреждён или несовместим. Выберите другой --session.") from None
        session.decisions = data["decisions"]
        session.conversation = data["conversation"]
        session._revisions[path.resolve()] = hashlib.sha256(raw).digest()
        return session

    def save(self, path):
        path = Path(path)
        data = {"version": "1", "decisions": self.decisions, "conversation": self.conversation}
        self._validate(data, load_catalog())
        raw = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        lock = path.with_name(path.name + ".lock")
        try:
            lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            raise ValueError("Файл диалога занят. Повторите сохранение позже.") from None
        try:
            os.close(lock_fd)
            revision = None
            if path.exists():
                with path.open("rb") as handle:
                    existing = handle.read(1_000_001)
                revision = hashlib.sha256(existing).digest()
            if revision != self._revisions.get(path.resolve()):
                raise ValueError("Диалог изменён другим процессом. Откройте его заново или сохраните в другой файл.")
            if revision == hashlib.sha256(raw).digest():
                return
            # Atomic replacement avoids partial writes; mkstemp creates mode 0600.
            fd, temporary = tempfile.mkstemp(prefix=".session-", dir=path.parent)
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(raw)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, path)
                self._revisions[path.resolve()] = hashlib.sha256(raw).digest()
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        finally:
            lock.unlink()

    def set_priority(self, text):
        if not isinstance(text, str) or len(text) > 500:
            raise ValueError("Приоритет должен быть текстом до 500 символов.")
        self.conversation["priority"] = text.strip()

    def choose(self, candidate_id):
        candidates = self.conversation["previous_candidates"]
        candidate = next((c for c in candidates if c["id"] == candidate_id), None)
        if candidate is None:
            raise ValueError("Такого варианта нет среди последних предложений.")
        errors = check_selection(candidate["decisions"], load_catalog())
        if errors:
            raise ValueError("; ".join(errors))
        self.decisions = deepcopy(candidate["decisions"])

    def ask(self, advisor, question, suggest=True):
        result = advisor.run(question, self.decisions, suggest=suggest,
                             conversation=deepcopy(self.conversation))
        if result["status"] != "ok" or result["briefing"] is None:
            return result
        brief = result["briefing"]
        text = "\n".join([brief["summary"]["text"],
                          *[s["text"] for s in brief["strengths"]],
                          *[s["text"] for s in brief["risks"]], brief["next_step"]])
        self.conversation["history"].extend([
            {"role": "user", "content": question},
            {"role": "assistant", "content": text},
        ])
        self.conversation["history"] = self.conversation["history"][-24:]
        while sum(len(m["content"]) for m in self.conversation["history"]) > MAX_HISTORY_CHARS:
            del self.conversation["history"][:2]
        # Retain the last offered set across explanatory follow-ups. Drop invalid candidates.
        candidates = [{"id": c["id"], "reason": c["reason"], "decisions": deepcopy(c["decisions"])}
                      for c in result["candidates"] if c["status"] in ("verified", "unverified")]
        if result["candidates"]:
            self.conversation["previous_candidates"] = candidates
        return result
