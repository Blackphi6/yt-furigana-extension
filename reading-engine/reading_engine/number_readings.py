"""Digit spans (+ 階/回 counters) → cardinal readings with sokuon.

Example: 21階 → にじゅういっかい（にじゅういちかい ではない）.
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


KAI_STYLE_UNITS = {"階": "かい", "回": "かい"}


def read_kai_style_counter(number: int, suffix: str = "かい") -> str:
    """21階→にじゅういっかい / 20階→にじゅっかい。"""
    if not isinstance(number, int) or number < 0:
        return ""
    unit = suffix or "かい"
    if number == 0:
        return f"ぜろ{unit}"
    if number % 10 == 0 and 10 <= number <= 90:
        t = number // 10
        head = "" if t == 1 else ("に" if t == 2 else _DIGIT[t])
        return f"{head}じゅっ{unit}"
    last = number % 10
    if last == 1:
        head = "" if number == 1 else read_cardinal(number - 1)
        return f"{head}いっ{unit}"
    if last == 6:
        head = "" if number == 6 else read_cardinal(number - 6)
        return f"{head}ろっ{unit}"
    if last == 8:
        head = "" if number == 8 else read_cardinal(number - 8)
        return f"{head}はっ{unit}"
    cardinal = read_cardinal(number)
    return f"{cardinal}{unit}" if cardinal else ""


def collect_number_tokens(text: str) -> list[dict[str, Any]]:
    src = text or ""
    tokens: list[dict[str, Any]] = []
    pos = 0
    while True:
        m = _NUMBER_RUN_RE.search(src, pos)
        if not m:
            break
        digit_surface = m.group(0)
        start = m.start()
        end = m.end()
        parsed = reading_for_digit_run(digit_surface)
        if not parsed:
            pos = end
            continue
        reading, digits = parsed
        integer = int(digits.split(".", 1)[0]) if digits else 0

        next_ch = src[end : end + 1]
        unit_reading = KAI_STYLE_UNITS.get(next_ch)
        if unit_reading:
            end += 1
            surface = src[start:end]
            combined = read_kai_style_counter(integer, unit_reading)
            if not combined:
                pos = end
                continue
            loose = f"{reading}{unit_reading}"
            cands = number_candidates(combined, digits)
            if loose != combined:
                cands = list(dict.fromkeys([*cands, loose]))
            tokens.append(
                {
                    "surface": surface,
                    "span": [start, end],
                    "reading": combined,
                    "confidence": 0.92,
                    "source": "number_rule",
                    "candidates": cands,
                }
            )
            pos = end
            continue

        tokens.append(
            {
                "surface": digit_surface,
                "span": [start, end],
                "reading": reading,
                "confidence": 0.9,
                "source": "number_rule",
                "candidates": number_candidates(reading, digits),
            }
        )
        pos = end
    return tokens


def merge_number_tokens(
    text: str, tokens: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """数字（＋階/回）を優先。重なる漢字トークンは落とす。"""
    numbers = collect_number_tokens(text)
    if not numbers:
        return tokens
    existing = list(tokens or [])
    kept = [
        t
        for t in existing
        if not (
            isinstance(t.get("span"), list)
            and any(
                t["span"][0] < n["span"][1] and t["span"][1] > n["span"][0]
                for n in numbers
            )
        )
    ]
    preferred = [
        t
        for t in existing
        if str(t.get("source") or "") in ("user_dict", "personal_name")
        and isinstance(t.get("span"), list)
        and any(
            t["span"][0] == n["span"][0] and t["span"][1] == n["span"][1]
            for n in numbers
        )
    ]
    preferred_keys = {f"{t['span'][0]}:{t['span'][1]}" for t in preferred}
    result = list(kept)
    for n in numbers:
        key = f"{n['span'][0]}:{n['span'][1]}"
        if key in preferred_keys:
            continue
        result.append(n)
    for p in preferred:
        if p not in result:
            result.append(p)
    result.sort(key=lambda t: t["span"][0])
    return result
