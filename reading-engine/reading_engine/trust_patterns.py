"""Idiom / minority-reading trust patterns (JRM article discovery #1).

LLM judges fail on these; never leave them to free-form models.
Patterns force a reading only when the surface token aligns and the
forced reading is already in (or injected into) the candidate lattice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TrustPattern:
    """Regex over full text → force reading for an exact surface token."""

    name: str
    pattern: re.Pattern[str]
    surface: str
    reading: str
    confidence: float = 0.99


# 慣用句・少数派読み（記事: 下手に出る＝したて）
TRUST_PATTERNS: list[TrustPattern] = [
    TrustPattern(
        name="shitáte-deru",
        pattern=re.compile(r"下手に出"),
        surface="下手",
        reading="したて",
    ),
    TrustPattern(
        name="shitáte-ni",
        pattern=re.compile(r"下手に(?:出|回|構)"),
        surface="下手",
        reading="したて",
    ),
    TrustPattern(
        name="shijou-kibo",
        pattern=re.compile(r"市場規模"),
        surface="市場",
        reading="しじょう",
    ),
    TrustPattern(
        name="kabushiki-shijou",
        pattern=re.compile(r"株式市場|金融市場|市場調査|市場経済"),
        surface="市場",
        reading="しじょう",
    ),
    TrustPattern(
        name="asa-ichiba",
        pattern=re.compile(r"(?:朝の|鮮魚|野菜).{0,6}市場|市場で(?:魚|野菜|買)"),
        surface="市場",
        reading="いちば",
    ),
    TrustPattern(
        name="towa-ni",
        pattern=re.compile(r"永遠に"),
        surface="永遠",
        reading="とわ",
        confidence=0.97,
    ),
    TrustPattern(
        name="eien-no",
        pattern=re.compile(r"永遠の"),
        surface="永遠",
        reading="えいえん",
        confidence=0.97,
    ),
]


def match_trust_reading(surface: str, full_text: str) -> TrustPattern | None:
    for rule in TRUST_PATTERNS:
        if rule.surface != surface:
            continue
        if rule.pattern.search(full_text):
            return rule
    return None
