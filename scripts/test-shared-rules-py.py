#!/usr/bin/env python3
"""読み推定 v2 の規則表（packages/furigana-ruby-engine/rules/v2-rules.json）を読み API が読んでいること。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "reading-engine"))

from reading_engine import CONTEXT_RULES, FALSE_SUFFIX_READINGS, MANUAL_PHRASES  # noqa: E402
from reading_engine.name_cues import NAME_CUES  # noqa: E402


def main() -> None:
    rules = json.loads((REPO / "packages/furigana-ruby-engine/rules/v2-rules.json").read_text("utf-8"))
    assert list(NAME_CUES) == rules["nameCues"]
    assert FALSE_SUFFIX_READINGS == rules["falseSuffixReadings"]
    for surface, reading in rules["phrases"].items():
        assert MANUAL_PHRASES.get(surface) == reading, surface
    for rule in rules["contextRules"]:
        assert any(
            r["surface"] == rule["surface"]
            and r["reading"] == rule["reading"]
            and all(c in r["cues"] for c in rule["cues"])
            for r in CONTEXT_RULES
        ), rule["surface"]
    print("共有の規則表のテスト（サーバー）: 問題なし")


if __name__ == "__main__":
    main()
