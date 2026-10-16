#!/usr/bin/env python3
"""ONNX 再ランクが transformers なしで動き、/health が読み込みを待たないことのテスト。

Render 無料枠（512MB）では transformers の AutoTokenizer だけで約 240MB 使い、
起動中にメモリ不足で落ちていた。
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "reading-engine"
sys.path.insert(0, str(ROOT))

import reading_engine.reranker as rr  # noqa: E402


def main() -> None:
    # 読み込み前は状態を返すだけで、読み込みを始めない
    assert rr.reranker_status() == (False, "none")
    assert rr._reranker is None

    onnx_dir = ROOT / "data" / "reranker-deploy" / "onnx"
    model = rr.CandidateRerankerOnnx(onnx_dir / "model.int8.onnx", onnx_dir)
    assert "transformers" not in sys.modules, "ONNX の経路で transformers を読み込まないこと"

    text = "辛いラーメンを食べた"
    pairs = model.score_pairs(text, "辛い", ["からい", "つらい"], (0, 2))
    assert [c for c, _ in pairs] == ["からい", "つらい"]
    assert abs(sum(p for _, p in pairs) - 1.0) < 1e-5
    assert max(pairs, key=lambda x: x[1])[0] == "からい", pairs
    print("ONNX 再ランクのテスト: 問題なし")


if __name__ == "__main__":
    main()
