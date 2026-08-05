#!/usr/bin/env python3
"""number_readings merge into analyze()."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine import get_engine  # noqa: E402
from reading_engine.number_readings import (  # noqa: E402
    collect_number_tokens,
    reading_for_digit_run,
    digit_by_digit,
)


def test_digit_run() -> None:
    assert reading_for_digit_run("21") == ("にじゅういち", "21")
    assert digit_by_digit("21") == "にいち"
    assert digit_by_digit("21", kata=True) == "ニーイチ"


def test_analyze_includes_number() -> None:
    eng = get_engine()
    out = eng.analyze("21階にバーテンダーがいるよ")
    surfaces = [t["surface"] for t in out["tokens"]]
    assert "21階" in surfaces
    assert "階" not in surfaces
    assert out["reading"].startswith("にじゅういっかい")
    assert not out["reading"].startswith("21")
    num = next(t for t in out["tokens"] if t["surface"] == "21階")
    assert "にじゅういちかい" in num["candidates"]


def test_collect_with_kai() -> None:
    toks = collect_number_tokens("21階にバーテンダーがいるよ")
    assert len(toks) == 1
    assert toks[0]["surface"] == "21階"
    assert toks[0]["reading"] == "にじゅういっかい"


def main() -> None:
    test_digit_run()
    test_collect_with_kai()
    test_analyze_includes_number()
    print("test-number-readings-py: ok")


if __name__ == "__main__":
    main()
