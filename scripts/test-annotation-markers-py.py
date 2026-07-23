#!/usr/bin/env python3
"""Tests for footnote / annotation marker stripping."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

from reading_engine.annotation_markers import (  # noqa: E402
    is_annotation_marker_inner,
    strip_annotation_markers,
)


def main() -> None:
    assert is_annotation_marker_inner("⑫") is True
    assert is_annotation_marker_inner("14") is True
    assert is_annotation_marker_inner("ね") is False

    sample = (
        "その姿は、ただの見物（⑫）人にとっても、間違いなく一枚上手（⑬）の生き様に見えた。"
        "彼は一日（⑭）中、一心不乱に手を動かし続けている。"
    )
    cleaned = strip_annotation_markers(sample)
    assert "（⑫）" not in cleaned
    assert "見物人" in cleaned
    assert "一日中" in cleaned
    assert "一枚上手" in cleaned
    assert strip_annotation_markers("音（ね）が聞こえる") == "音（ね）が聞こえる"

    print("annotation markers python tests passed.")


if __name__ == "__main__":
    main()
