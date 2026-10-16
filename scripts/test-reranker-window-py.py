#!/usr/bin/env python3
"""再ランクに渡す文脈を語の前後に絞る処理のテスト（重い依存は読み込まない）。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine.reranker import context_window  # noqa: E402


def main() -> None:
    text = "あ" * 50 + "一日" + "い" * 50
    # span があればその位置の前後 size 字
    assert context_window(text, "一日", (50, 52), 3) == "あああ一日いいい"
    # span が無ければ表層の最初の出現で探す
    assert context_window(text, "一日", None, 2) == "ああ一日いい"
    # 文頭・文末ははみ出さない
    assert context_window("一日中", "一日", (0, 2), 32) == "一日中"
    # 表層が見つからないとき・size が 0 以下のときは全文
    assert context_window("今日は", "明日", None, 32) == "今日は"
    assert context_window(text, "一日", (50, 52), 0) == text
    # 範囲外の span は表層検索に戻す
    assert context_window("一日中", "一日", (10, 12), 1) == "一日中"
    print("再ランク文脈ウィンドウのテスト: 問題なし")


if __name__ == "__main__":
    main()
