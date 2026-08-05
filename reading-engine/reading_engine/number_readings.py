"""Bare Arabic/fullwidth digit spans → cardinal + digit-by-digit candidates.

Keeps counter kanji (階 etc.) as separate tokens so heteronym quiz stays.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

_DIGIT = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"]
_DIGIT_SEQ_HIRA = [
    "ぜろ",
    "いち",
    "に",
    "さん",
    "よん",
    "ご",
    "ろく",
    "なな",
    "はち",
    "きゅう",
]
_DIGIT_SEQ_KATA = [
    "ゼロ",
    "イチ",
    "ニー",
    "サン",
    "ヨン",
    "ゴー",
    "ロク",
    "ナナ",
    "ハチ",
    "キュー",
]

_NUMBER_RUN_RE = re.compile(r"[0-9０-９]+(?:,[0-9０-９]+)*(?:\.[0-9０-９]+)?")
_KATA_TO_HIRA = str.maketrans({i: i - 0x60 for i in range(0x30A1, 0x30F7)})


def _to_ascii_digits(text: str) -> str:
    s = unicodedata.normalize("NFKC", text or "")
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return s.replace(",", "").replace("，", "")


def _read_under_1000(n: int) -> str:
    if n <= 0:
        return ""
    if n < 10:
        return _DIGIT[n]
    if n < 100:
        tens, ones = divmod(n, 10)
        out = "じゅう" if tens == 1 else f"{_DIGIT[tens]}じゅう"
        if ones:
            out += _DIGIT[ones]
        return out
    hundreds, rest = divmod(n, 100)
    if hundreds == 1:
        out = "ひゃく"
    elif hundreds == 3:
        out = "さんびゃく"
    elif hundreds == 6:
        out = "ろっぴゃく"
    elif hundreds == 8:
        out = "はっぴゃく"
    else:
        out = f"{_DIGIT[hundreds]}ひゃく"
    return out + _read_under_1000(rest)


def read_cardinal(n: int) -> str:
    if not isinstance(n, int) or n < 0 or n > 9999_9999_9999:
        return ""
    if n == 0:
        return "ぜろ"
    parts: list[str] = []
    oku = n // 1_0000_0000
    man = (n % 1_0000_0000) // 1_0000
    rest = n % 1_0000
    if oku:
        parts.append("いちおく" if oku == 1 else f"{_read_under_1000(oku)}おく")
    if man:
        parts.append("いちまん" if man == 1 else f"{_read_under_1000(man)}まん")
    if rest:
        if rest < 1000:
            parts.append(_read_under_1000(rest))
        else:
            thousands, under = divmod(rest, 1000)
            if thousands == 1:
                chunk = "せん"
            elif thousands == 3:
                chunk = "さんぜん"
            elif thousands == 8:
                chunk = "はっせん"
            else:
                chunk = f"{_DIGIT[thousands]}せん"
            chunk += _read_under_1000(under)
            parts.append(chunk)
    return "".join(parts)


def reading_for_digit_run(number_part: str) -> tuple[str, str] | None:
    cleaned = _to_ascii_digits(number_part)
    if not re.fullmatch(r"\d+(\.\d+)?", cleaned):
        return None
    if "." in cleaned:
        int_part, frac_part = cleaned.split(".", 1)
    else:
        int_part, frac_part = cleaned, None
    integer = int(int_part)
    if frac_part is None:
        reading = "ぜろ" if integer == 0 else read_cardinal(integer)
    else:
        head = "れい" if integer == 0 else read_cardinal(integer)
        frac = "".join(_DIGIT_SEQ_HIRA[int(d)] for d in frac_part)
        reading = f"{head}てん{frac}"
    if not reading:
        return None
    return reading, cleaned


def digit_by_digit(digits: str, *, kata: bool = False) -> str:
    cleaned = _to_ascii_digits(digits).replace(".", "")
    if not cleaned.isdigit():
        return ""
    table = _DIGIT_SEQ_KATA if kata else _DIGIT_SEQ_HIRA
    return "".join(table[int(d)] for d in cleaned)


def number_candidates(primary: str, digits: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        s = (value or "").strip()
        if not s or s in seen:
            return
        seen.add(s)
        out.append(s)

    add(primary)
    hira = digit_by_digit(digits, kata=False)
    if hira and hira != primary:
        add(hira)
    kata = digit_by_digit(digits, kata=True)
    if kata:
        add(kata)
    return out


def collect_number_tokens(text: str) -> list[dict[str, Any]]:
    src = text or ""
    tokens: list[dict[str, Any]] = []
    for m in _NUMBER_RUN_RE.finditer(src):
        surface = m.group(0)
        parsed = reading_for_digit_run(surface)
        if not parsed:
            continue
        reading, digits = parsed
        tokens.append(
            {
                "surface": surface,
                "span": [m.start(), m.end()],
                "reading": reading,
                "confidence": 0.9,
                "source": "number_rule",
                "candidates": number_candidates(reading, digits),
            }
        )
    return tokens


def merge_number_tokens(
    text: str, tokens: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Insert number_rule tokens into gaps; enrich same-span user pins."""
    numbers = collect_number_tokens(text)
    if not numbers:
        return tokens
    existing = list(tokens or [])
    result = list(existing)
    for n in numbers:
        same = next(
            (
                t
                for t in existing
                if isinstance(t.get("span"), list)
                and t["span"][0] == n["span"][0]
                and t["span"][1] == n["span"][1]
            ),
            None,
        )
        if same is not None:
            prev = list(same.get("candidates") or [])
            merged = number_candidates(
                str(same.get("reading") or n["reading"]), n["surface"]
            )
            same["candidates"] = list(dict.fromkeys([*prev, *merged, *n["candidates"]]))
            if not same.get("reading"):
                same["reading"] = n["reading"]
            continue
        overlaps = any(
            isinstance(t.get("span"), list)
            and t["span"][0] < n["span"][1]
            and t["span"][1] > n["span"][0]
            for t in existing
        )
        if overlaps:
            continue
        result.append(n)
    result.sort(key=lambda t: t["span"][0])
    return result
