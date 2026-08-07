#!/usr/bin/env python3
"""dev-ingest helpers (no live Groq)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine.dev_ingest import commit_learning_items  # noqa: E402
from reading_engine.proposals import summarize_proposals  # noqa: E402


def main() -> None:
    # empty → error
    try:
        commit_learning_items([])
        raise SystemExit("empty should fail")
    except ValueError:
        pass

    out = commit_learning_items(
        [
            {
                "text": "金星を見上げる",
                "surface": "金星",
                "gold": "きんせい",
                "note": "planet",
            }
        ],
        note="unit-test",
        client_ip="127.0.0.1",
    )
    assert out["ok"] and out["saved"] == 1, out
    summary = summarize_proposals()
    assert summary["total"] >= 1
    print("test-dev-ingest-py: ok")


if __name__ == "__main__":
    main()
