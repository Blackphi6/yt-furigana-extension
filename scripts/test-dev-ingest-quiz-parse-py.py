#!/usr/bin/env python3
"""quiz paste parser: いれる・はいれる → 2 excerpts."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine.dev_ingest import parse_quiz_paste  # noqa: E402


SAMPLE = """
【問題】
21. 水を入れると、ここには入れる。
22. 内輪の話にとどめ
【解答】
21. いれる・はいれる
22. うちわ
"""


def main() -> None:
    items = parse_quiz_paste(SAMPLE)
    by = {(r["surface"], r["gold"]): r["text"] for r in items}
    assert ("入れる", "いれる") in by, by
    assert ("入れる", "はいれる") in by, by
    assert "水を入れると" in by[("入れる", "いれる")], by
    assert "ここには入れる" in by[("入れる", "はいれる")], by
    assert by[("内輪", "うちわ")], by

    # セクション無し（問題行と解答行が混在）
    flat = parse_quiz_paste(
        "21. 水を入れると、ここには入れる。\n21. いれる・はいれる\n"
    )
    golds = {(r["surface"], r["gold"]) for r in flat}
    assert ("入れる", "いれる") in golds and ("入れる", "はいれる") in golds, golds
    print("test-dev-ingest-quiz-parse-py: ok", len(items), "items")


if __name__ == "__main__":
    main()
