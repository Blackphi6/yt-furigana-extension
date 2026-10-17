#!/usr/bin/env python3
"""読み API が Sudachi（モード C）の長い単位の読みを使うことのテスト。

UniDic は 行動力 を 行動|力 に分け、力 を ちから と読んでいた（拡張の読み API 経由で こうどうちから と出た原因）。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine import ReadingEngine  # noqa: E402
from reading_engine.sudachi_long import (  # noqa: E402
    is_compositional_number,
    is_number_with_counter,
    long_unit_spans,
)


def reading_of(result: dict, surface: str) -> str | None:
    for tok in result["tokens"]:
        if tok["surface"] == surface:
            return tok["reading"]
    return None


def main() -> None:
    assert is_number_with_counter("三本") is True
    assert is_number_with_counter("3本") is True
    assert is_number_with_counter("行動力") is False
    # 数字の読みから組み立てられる読みは数詞の規則に任せ、特別な読み（はたち）だけ Sudachi を使う
    assert is_compositional_number("三本", "さんぽん") is True
    assert is_compositional_number("二十歳", "はたち") is False
    assert is_compositional_number("二十日", "はつか") is False

    spans = long_unit_spans("彼は行動力がある")
    if spans is None:
        print("Sudachi 長単位のテスト: sudachipy が無いので省略")
        return
    assert ("行動力", "こうどうりょく") in [(s, r) for _, _, s, r in spans], spans

    engine = ReadingEngine()
    assert reading_of(engine.analyze("彼は行動力がある"), "行動力") == "こうどうりょく"
    assert reading_of(engine.analyze("大分県に行く"), "大分県") == "おおいたけん"
    # 人名辞書の 本橋（もとはし）より、長い一般語の 日本橋 を優先する（ゲートB）
    assert reading_of(engine.analyze("日本橋で降りる"), "日本橋") == "にほんばし"
    # 数字の読みから組み立てられない特別な読みは Sudachi を使う
    assert reading_of(engine.analyze("二十歳になった"), "二十歳") == "はたち"
    # じゅう／ぢゅう のような表記の揺れだけの読みは同形異音語にしない。2字以上の語のあとの 雨 は あめ
    result = engine.analyze("一日中雨が降った")
    assert reading_of(result, "一日中") == "いちにちじゅう", result["tokens"]
    assert reading_of(result, "雨") == "あめ", result["tokens"]
    # 同形異音語は Sudachi で決めず、文脈規則に任せる
    assert reading_of(engine.analyze("夜の公園は人気がない"), "人気") == "ひとけ"
    # 数詞＋助数詞は Sudachi（さんぽん）を使わない
    assert reading_of(engine.analyze("鉛筆を三本買う"), "三本") != "さんぽん"
    print("Sudachi 長単位のテスト: 問題なし")


if __name__ == "__main__":
    main()
