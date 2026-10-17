#!/usr/bin/env python3
"""読み API サーバー（reading_engine）を、第0段階の確認用データで評価する。

拡張側の evaluate-reading-v2.mjs と同じく、指定した語の範囲の読みを厳密に比べる。
  python3 scripts/learning/evaluate_reading_v2_server.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reading-engine"))

from reading_engine import ReadingEngine, normalize_reading  # noqa: E402


def reading_of_span(text: str, tokens: list[dict], surface: str, at: int = 0) -> str | None:
    """API の tokens（span 付き）から、text 中の surface（at 番目）の読み。区切りが語の途中なら None。"""
    start = -1
    frm = 0
    for _ in range(at + 1):
        start = text.find(surface, frm)
        if start < 0:
            return None
        frm = start + 1
    end = start + len(surface)
    covered = sorted((t for t in tokens if t["span"][0] < end and t["span"][1] > start), key=lambda t: t["span"][0])
    reading = ""
    pos = start
    for tok in covered:
        s, e = tok["span"]
        if s < start or e > end:
            return None
        reading += text[pos:s] + tok["reading"]
        pos = e
    reading += text[pos:end]
    return normalize_reading(reading) or None


def main() -> None:
    cases = [
        json.loads(line)
        for line in (ROOT / "data/learning/benches/reading-v2-regression.jsonl").read_text("utf-8").splitlines()
        if line.strip()
    ]
    engine = ReadingEngine()
    by_cat: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    failed = []
    for c in cases:
        result = engine.analyze(c["text"])
        got = reading_of_span(c["text"], result["tokens"], c["surface"], c.get("at", 0))
        ok = got == c["reading"]
        by_cat[c["category"]][1] += 1
        if ok:
            by_cat[c["category"]][0] += 1
        else:
            failed.append((c["surface"], c["reading"], got or "（区切り違い）"))
    passed = sum(v[0] for v in by_cat.values())
    print(f"■ サーバー（UniDic＋再ランク）: {passed}/{len(cases)}")
    for cat, (p, t) in by_cat.items():
        print(f"  {cat}: {p}/{t}")
    for surface, want, got in failed:
        print(f"  × {surface}: 正解 {want} / 結果 {got}")


if __name__ == "__main__":
    main()
