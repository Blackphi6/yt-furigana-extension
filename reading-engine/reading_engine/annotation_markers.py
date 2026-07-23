"""Strip textbook / caption footnote markers before morphological analysis.

「見物（⑫）人」「一日（⑭）中」が注釈で分割されるのを防ぐ。
読みカッコ「音（ね）」は残す（かなのみ）。
"""

from __future__ import annotations

import re
import unicodedata

# ①-⑳ ㉑-㉟ ㊱-㊿
_CIRCLED = (
    "\u2460-\u2473"  # ①-⑳
    "\u3251-\u325f"  # ㉑-㉟
    "\u32b1-\u32bf"  # ㊱-㊿
)

_KANA_ONLY = re.compile(r"^[\u3040-\u309f\u30a0-\u30ffー]+$")
_DIGITS = re.compile(r"^[0-9]+$")
_CIRCLED_ONLY = re.compile(f"^[{_CIRCLED}]+$", re.UNICODE)
_PAREN = re.compile(r"[（(]([^）)]{1,8})[）)]")


def is_annotation_marker_inner(inner: str) -> bool:
    s = unicodedata.normalize("NFKC", str(inner or "")).strip()
    if not s:
        return False
    if _KANA_ONLY.match(s):
        return False
    if _DIGITS.match(s):
        return True
    if _CIRCLED_ONLY.match(s):
        return True
    if re.match(r"^[0-9]+[\u3040-\u309f]?$", s) and len(s) <= 4:
        return True
    return False


def strip_annotation_markers(text: str) -> str:
    source = str(text or "")
    if not source:
        return ""

    def repl(match: re.Match[str]) -> str:
        inner = match.group(1)
        return "" if is_annotation_marker_inner(inner) else match.group(0)

    return _PAREN.sub(repl, source)
