#!/usr/bin/env python3
"""reranker が高確信で正解した例から context cue を提案する（端末内へ蒸留）。"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reading-engine"))

from reading_engine import ReadingEngine  # noqa: E402
from reading_engine.reranker import get_reranker  # noqa: E402

SEPS = "。！？\n、"


def clause_context(text: str, start: int, end: int) -> str:
    s = max(0, min(start, len(text)))
    e = max(s, min(end, len(text)))
    left = 0
    for i in range(s - 1, -1, -1):
        if text[i] in SEPS:
            left = i + 1
            break
    right = len(text)
    for i in range(e, len(text)):
        if text[i] in SEPS:
            right = i
            break
    return text[left:right]


def harvest_cues(local: str, surface: str) -> list[str]:
    idx = local.find(surface)
    if idx < 0:
        return []
    before = local[:idx]
    after = local[idx + len(surface) :]
    cues: set[str] = set()
    for side, chunk in (("before", before), ("after", after)):
        chunk = re.sub(r"\s+", "", chunk)
        for n in (2, 3, 4):
            if len(chunk) >= n:
                cues.add(chunk[-n:] if side == "before" else chunk[:n])
    return [c for c in cues if c and c != surface and len(c) >= 2][:6]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--train",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-smoke.jsonl",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=0.85,
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-distill-proposals.json",
    )
    args = parser.parse_args()

    if get_reranker() is None:
        raise SystemExit("reranker not loaded — train + export first")

    rows = []
    for line in args.train.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))

    engine = ReadingEngine()
    proposals: list[dict] = []
    for row in rows:
        text = row["text"]
        surface = row["surface"]
        gold = row["gold"]
        result = engine.analyze(text)
        tok = next((t for t in result["tokens"] if t["surface"] == surface), None)
        if not tok:
            continue
        if tok.get("source") != "reranker":
            continue
        if float(tok.get("confidence") or 0) < args.min_confidence:
            continue
        if tok.get("reading") != gold:
            continue
        span = tok.get("span") or [0, len(text)]
        local = clause_context(text, span[0], span[1])
        cues = harvest_cues(local, surface)
        if not cues:
            continue
        proposals.append(
            {
                "surface": surface,
                "reading": gold,
                "weight": 4,
                "cues": cues,
                "text": text,
                "confidence": tok.get("confidence"),
            }
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(proposals, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"proposals={len(proposals)} → {args.out}")


if __name__ == "__main__":
    main()
