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
    # 永遠: デフォルトはえいえん。とわは主観・感情・文学寄りのみ強制。
    # 「永遠に」全面＝とわは誤り（例: 永遠に終わらない＝えいえん）。
    TrustPattern(
        name="towa-lyric-ai",
        pattern=re.compile(r"ただ永遠に|永遠に愛|永遠の愛|永遠の眠り|とわに"),
        surface="永遠",
        reading="とわ",
        confidence=0.97,
    ),
    TrustPattern(
        name="eien-objective",
        pattern=re.compile(
            r"永遠の(?:テーマ|課題|命題|命|若さ)|永遠に(?:終わ|続く|未完成)"
        ),
        surface="永遠",
        reading="えいえん",
        confidence=0.97,
    ),
    TrustPattern(
        name="kuu-wo-kiru",
        pattern=re.compile(r"空を切"),
        surface="空",
        reading="くう",
    ),
    TrustPattern(
        name="oogoto-ni-naru",
        pattern=re.compile(r"大事に(?:なる|した|なるぞ|なるな)|大事になる"),
        surface="大事",
        reading="おおごと",
    ),
]


def match_trust_reading(surface: str, full_text: str) -> TrustPattern | None:
    for rule in TRUST_PATTERNS:
        if rule.surface != surface:
            continue
        if rule.pattern.search(full_text):
            return rule
    return None
