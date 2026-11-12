#!/usr/bin/env python3
"""number_readings merge into analyze()."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

# fugashi 無しでも数字規則だけ検証できるよう、モジュールを直読みする
_NR_PATH = ROOT / "reading_engine" / "number_readings.py"
_spec = importlib.util.spec_from_file_location("number_readings_standalone", _NR_PATH)
assert _spec and _spec.loader
_nr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_nr)
collect_number_tokens = _nr.collect_number_tokens
reading_for_digit_run = _nr.reading_for_digit_run
digit_by_digit = _nr.digit_by_digit


def test_digit_run() -> None:
    assert reading_for_digit_run("21") == ("にじゅういち", "21")
    assert digit_by_digit("21") == "にいち"
    assert digit_by_digit("21", kata=True) == "ニーイチ"


def test_collect_with_kai() -> None:
    toks = collect_number_tokens("21階にバーテンダーがいるよ")
    assert len(toks) == 1
    assert toks[0]["surface"] == "21階"
    assert toks[0]["reading"] == "にじゅういっかい"


def test_collect_9ji() -> None:
    for text in ("午前9時に家を出る", "午前 9時に家を出る"):
        toks = collect_number_tokens(text)
        assert len(toks) == 1, text
        assert toks[0]["surface"] == "9時", text
        assert toks[0]["reading"] == "くじ", text
    assert collect_number_tokens("4時")[0]["reading"] == "よじ"
    assert collect_number_tokens("7時")[0]["reading"] == "しちじ"
    assert collect_number_tokens("0時")[0]["reading"] == "れいじ"
    assert collect_number_tokens("7月")[0]["reading"] == "しちがつ"
    assert collect_number_tokens("1日")[0]["reading"] == "ついたち"


def test_collect_counter_across_space() -> None:
    # 字幕は「20 人」のように数字の前後に空白を入れることが多い
    for text, surface in (
        ("推薦人 20 人分の宴席を用意してたらしいんです", "20 人"),
        ("推薦人 ２０ 人分の宴席", "２０ 人"),
        ("推薦人　２０　人分の宴席", "２０　人"),
    ):
        toks = collect_number_tokens(text)
        assert len(toks) == 1, text
        assert toks[0]["surface"] == surface, text
        assert toks[0]["reading"] == "にじゅうにん", text
        start, end = toks[0]["span"]
        assert text[start:end] == surface, text
    assert collect_number_tokens("午後 3 時に集合")[0]["reading"] == "さんじ"
    assert collect_number_tokens("2 人で行く")[0]["reading"] == "ふたり"


def test_collect_counter_across_space_keeps_compounds() -> None:
    # 空白の先で解析器が2文字以上の語を始めていれば、数字だけを読む
    text = "ベスト 8 日本代表"
    toks = collect_number_tokens(text, frozenset({text.index("日本")}))
    assert [t["surface"] for t in toks] == ["8"]
    # 空白がなければ従来どおり（語の判定は見ない）
    assert collect_number_tokens("8日", frozenset({1}))[0]["surface"] == "8日"
    # 空白が長いものは区切りとみなす
    assert collect_number_tokens("20   人")[0]["surface"] == "20"


def test_analyze_counter_across_space() -> None:
    from reading_engine import get_engine  # noqa: WPS433

    eng = get_engine()
    for text, surface, reading in (
        ("推薦人 20 人分の宴席を用意してたらしいんです", "20 人", "にじゅうにん"),
        ("推薦人 ２０ 人分の宴席", "２０ 人", "にじゅうにん"),
        ("毎日 5 分だけ練習する", "5 分", "ごふん"),
    ):
        tokens = eng.analyze(text, user_dict=[])["tokens"]
        hit = next(t for t in tokens if t["surface"] == surface)
        assert hit["reading"] == reading, (text, hit)
    # 空白の先が別の語なら、その語の読みを残す
    for text, word in (
        ("ベスト 8 日本代表", "日本"),
        ("iPhone 15 分割払い", "分割"),
        ("レベル 5 人間", "人間"),
        ("全 3 回転", "回転"),
        ("第 2 月曜日", "月曜日"),
        ("あと 3 時間", "時間"),
        ("ベスト 10 人気の店", "人気"),
    ):
        surfaces = [t["surface"] for t in eng.analyze(text, user_dict=[])["tokens"]]
        assert word in surfaces, (text, surfaces)


def test_analyze_includes_number() -> None:
    from reading_engine import get_engine  # noqa: WPS433

    eng = get_engine()
    out = eng.analyze("21階にバーテンダーがいるよ")
    surfaces = [t["surface"] for t in out["tokens"]]
    assert "21階" in surfaces
    assert "階" not in surfaces
    assert out["reading"].startswith("にじゅういっかい")
    assert not out["reading"].startswith("21")
    num = next(t for t in out["tokens"] if t["surface"] == "21階")
    assert "にじゅういちかい" in num["candidates"]


def test_analyze_9ji() -> None:
    from reading_engine import get_engine  # noqa: WPS433

    eng = get_engine()
    out = eng.analyze("午前9時に家を出る")
    surfaces = [t["surface"] for t in out["tokens"]]
    assert "9時" in surfaces
    assert "時" not in surfaces
    assert "くじ" in out["reading"]
    assert "きゅうどき" not in out["reading"]
    assert "どき" not in out["reading"]


def main() -> None:
    test_digit_run()
    test_collect_with_kai()
    test_collect_9ji()
    test_collect_counter_across_space()
    test_collect_counter_across_space_keeps_compounds()
    try:
        test_analyze_includes_number()
        test_analyze_9ji()
        test_analyze_counter_across_space()
    except ModuleNotFoundError as exc:
        # CI / 素の python3 に fugashi が無いときは数字規則だけ通す
        if "fugashi" not in str(exc):
            raise
        print("test-number-readings-py: skip analyze (no fugashi)")
    print("test-number-readings-py: ok")


if __name__ == "__main__":
    main()
