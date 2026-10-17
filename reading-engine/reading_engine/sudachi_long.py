"""Sudachi（モード C）の長い単位の読み。

UniDic は複合語を短く分けて1字ずつ読む（行動|力→こうどうちから、日本|橋→にっぽんはし）。
Sudachi のモード C は 行動力・日本橋・大分県 を1語として辞書の読みを持つので、
UniDic が2語以上に分けた語の読みとして使う。sudachipy が無い環境では使わない（None）。
"""

from __future__ import annotations

import os
import re
import sys
import threading

_KANJI = re.compile(r"[㐀-鿿]")
# 数詞＋助数詞（三本・3本）は Sudachi も さんぽん と誤るので使わない
_NUMBER_WITH_COUNTER = re.compile(r"^[0-9０-９〇零一二三四五六七八九十百千万]+[^\s0-9０-９]$")

_FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")

_tokenizer = None
_load_failed = False
_lock = threading.Lock()


def is_number_with_counter(surface: str) -> bool:
    return bool(_NUMBER_WITH_COUNTER.match(surface))


# 先頭の数字の読みの出だし。読みがこれで始まれば「数字の読み＋助数詞」の組み立て
_NUMERAL_HEADS = {
    "一": ("いち", "いっ"), "二": ("に",), "三": ("さん",), "四": ("よん", "よ", "し"),
    "五": ("ご",), "六": ("ろく", "ろっ"), "七": ("なな", "しち"), "八": ("はち", "はっ"),
    "九": ("きゅう", "く"), "十": ("じゅう", "じゅっ", "じっ"), "百": ("ひゃく", "ひゃっ"),
    "千": ("せん",), "万": ("まん",), "〇": ("ぜろ", "れい"), "零": ("ぜろ", "れい"),
    "0": ("ぜろ", "れい"), "1": ("いち", "いっ"), "2": ("に",), "3": ("さん",),
    "4": ("よん", "よ", "し"), "5": ("ご",), "6": ("ろく", "ろっ"), "7": ("なな", "しち"),
    "8": ("はち", "はっ"), "9": ("きゅう", "く"),
}


def is_compositional_number(surface: str, reading: str) -> bool:
    """数字の読みから組み立てた読みか（三本→さんぽん）。特別な読み（二十歳→はたち）なら False。"""
    head = _NUMERAL_HEADS.get(surface.translate(_FULLWIDTH_DIGITS)[:1], ())
    return any(reading.startswith(h) for h in head)


def _get_tokenizer():
    global _tokenizer, _load_failed
    if _tokenizer is not None or _load_failed:
        return _tokenizer
    with _lock:
        if _tokenizer is not None or _load_failed:
            return _tokenizer
        try:
            from sudachipy import Dictionary, SplitMode

            dict_name = os.environ.get("YT_FURIGANA_SUDACHI_DICT", "core")
            _tokenizer = (Dictionary(dict=dict_name).create(mode=SplitMode.C), SplitMode.C)
            print(f"[reading_engine] sudachi long-unit ← {dict_name}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            _load_failed = True
            print(f"[reading_engine] sudachi skipped: {exc}", file=sys.stderr)
    return _tokenizer


def warm() -> None:
    _get_tokenizer()


def _hiragana(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def long_unit_spans(text: str) -> list[tuple[int, int, str, str]] | None:
    """漢字を含む2字以上の長単位語の (start, end, surface, ひらがな読み)。Sudachi が無ければ None。"""
    loaded = _get_tokenizer()
    if loaded is None:
        return None
    tokenizer, mode = loaded
    spans: list[tuple[int, int, str, str]] = []
    for m in tokenizer.tokenize(text, mode):
        surface = m.surface()
        if len(surface) < 2 or not _KANJI.search(surface):
            continue
        reading = _hiragana(m.reading_form())
        if not reading or reading == surface:
            continue
        spans.append((m.begin(), m.end(), surface, reading))
    return spans
