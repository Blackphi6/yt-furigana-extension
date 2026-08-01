"""Japanese surname phrases (MIT) for longest-match overlays."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PHRASES_JSON = REPO_ROOT / "data" / "generated" / "personal-name-phrases.json"
EXTRA_JSON = REPO_ROOT / "data" / "personal-name-extra.json"


@lru_cache(maxsize=1)
def load_personal_name_phrases() -> dict[str, str]:
    phrases: dict[str, str] = {}
    if PHRASES_JSON.is_file():
        data = json.loads(PHRASES_JSON.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            phrases.update({str(k): str(v) for k, v in data.items() if k and v})
    elif EXTRA_JSON.is_file():
        data = json.loads(EXTRA_JSON.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            phrases.update({str(k): str(v) for k, v in data.items() if k and v})
    return phrases


def longest_phrase_at(
    text: str, index: int, phrases: dict[str, str], *, min_len: int = 2
) -> tuple[str, str] | None:
    """Return (surface, reading) for the longest phrase starting at index."""
    if not text or index < 0 or index >= len(text) or not phrases:
        return None
    best: tuple[str, str] | None = None
    # Cap scan length (surnames are short)
    max_len = min(8, len(text) - index)
    for length in range(min_len, max_len + 1):
        surface = text[index : index + length]
        reading = phrases.get(surface)
        if reading:
            best = (surface, reading)
    return best


def collect_phrase_spans(
    text: str, phrases: dict[str, str]
) -> list[tuple[int, int, str, str]]:
    """Non-overlapping longest matches: (start, end, surface, reading)."""
    spans: list[tuple[int, int, str, str]] = []
    i = 0
    n = len(text or "")
    while i < n:
        hit = longest_phrase_at(text, i, phrases)
        if hit:
            surface, reading = hit
            spans.append((i, i + len(surface), surface, reading))
            i += len(surface)
        else:
            i += 1
    return spans
