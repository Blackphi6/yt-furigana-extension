#!/usr/bin/env python3
"""創作ルビ後処理が複合語（金星）を壊さないこと。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine import ReadingEngine  # noqa: E402


def main() -> None:
    engine = ReadingEngine()

    # 短い文: 従来どおり金星がまとまる
    short = "金星を見上げ、金星を挙げる。"
    short_toks = [
        t
        for t in engine.analyze(short)["tokens"]
        if "金" in t["surface"] or "星" in t["surface"]
    ]
    assert all(t["surface"] == "金星" for t in short_toks), short_toks
    assert len(short_toks) == 2, short_toks

    # 長い文に「風」があると、旧実装は先頭の星→スターで金星を破壊していた
    long = (
        "風が強くて帽子が飛んだ。玉石を見分ける。"
        "金星を見上げ、金星を挙げる。薬湯に入る。"
    )
    long_result = engine.analyze(long)
    kinsei = [t for t in long_result["tokens"] if t["surface"] == "金星"]
    star_only = [
        t
        for t in long_result["tokens"]
        if t["surface"] == "星" and "スター" in (t.get("reading") or "")
    ]
    assert len(kinsei) == 2, f"expected two 金星 tokens, got {kinsei!r}"
    assert not star_only, f"star creative must not punch 金星: {star_only!r}"

    # 氷菓の複合創作は従来どおり動く
    ice = engine.analyze(
        "夏の木陰に座ったまま、「氷菓」を口に放り込んで風を待っていた"
    )
    ice_tok = next(t for t in ice["tokens"] if t["surface"] == "氷菓")
    assert ice_tok["reading"] in ("あいす", "アイス") or "あいす" in ice_tok.get(
        "candidates", []
    ), ice_tok

    print("test-creative-ruby-compound-py: ok")


if __name__ == "__main__":
    main()
