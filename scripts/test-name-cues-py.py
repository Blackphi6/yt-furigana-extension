#!/usr/bin/env python3
"""読み API: 敬称など人名の手がかりの直前の語は、人名辞書の読みを使う（読み推定 v2 第3段階）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine import ReadingEngine  # noqa: E402
from reading_engine.name_cues import find_name_before_cue, name_cue_spans  # noqa: E402


def reading_of(result: dict, surface: str) -> str | None:
    for tok in result["tokens"]:
        if tok["surface"] == surface:
            return tok["reading"]
    return None


def main() -> None:
    names = {"相場": "あいば", "明神": "あかがみ"}
    assert find_name_before_cue("相場さんが来た", 2, names) == (0, 2, "相場", "あいば")
    assert find_name_before_cue("株の相場が上がる", 4, names) is None
    # 「様」は神仏にも付くので手がかりにしない
    assert name_cue_spans("明神様にお参り", names) == []
    assert name_cue_spans("相場さんと相場くん", names) == [(0, 2, "相場", "あいば"), (5, 7, "相場", "あいば")]

    engine = ReadingEngine()
    assert reading_of(engine.analyze("相場さんが来た"), "相場") == "あいば"
    assert reading_of(engine.analyze("株の相場が上がる"), "相場") == "そうば"
    # ユーザー登録が勝つ
    pinned = engine.analyze("相場さんが来た", user_dict=[{"surface": "相場", "reading": "そうば"}])
    assert reading_of(pinned, "相場") == "そうば"
    print("人名の手がかりのテスト（サーバー）: 問題なし")


if __name__ == "__main__":
    main()
