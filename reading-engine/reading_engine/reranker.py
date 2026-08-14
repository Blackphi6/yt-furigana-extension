"""候補制約 ModernBERT reranker（任意）。

候補リスト以外の読みは出さない。PyTorch または ONNX Runtime で推論。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Sequence

_ENGINE_ROOT = Path(__file__).resolve().parents[1]


def _read_gate_ok(path: Path) -> bool:
    meta = path / "train-meta.json"
    if not meta.exists():
        return True
    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True
    return bool(data.get("gate_ok", True))


def resolve_reranker_paths() -> tuple[Path | None, Path | None]:
    """(model_dir, onnx_file) — 環境変数 → deploy バンドル → prod の順。"""
    env_model = os.environ.get("YT_FURIGANA_RERANKER_PATH", "").strip()
    env_onnx = os.environ.get("YT_FURIGANA_RERANKER_ONNX", "").strip()

    model_candidates: list[Path] = []
    if env_model:
        model_candidates.append(Path(env_model))
    model_candidates.extend(
        [
            _ENGINE_ROOT / "data" / "reranker-deploy",
            _ENGINE_ROOT / "train" / "artifacts" / "reranker-prod",
            _ENGINE_ROOT / "train" / "artifacts" / "reranker-smoke",
        ]
    )

    model_dir: Path | None = None
    for cand in model_candidates:
        if not cand.exists():
            continue
        if (cand / "config.json").exists() and _read_gate_ok(cand):
            model_dir = cand
            break
        onnx_sub = cand / "onnx"
        if onnx_sub.is_dir() and _read_gate_ok(cand):
            model_dir = cand
            break

    if env_onnx and Path(env_onnx).exists():
        return model_dir, Path(env_onnx)

    if model_dir:
        for name in ("model.int8.onnx", "model.onnx", "model_quantized.onnx"):
            p = model_dir / "onnx" / name
            if p.exists():
                return model_dir, p
        if (model_dir / "model.onnx").exists():
            return model_dir, model_dir / "model.onnx"

    return model_dir, None


class CandidateRerankerOnnx:
    """ONNX Runtime — torch 不要（Render / 拡張向け軽量推論）。"""

    def __init__(self, onnx_path: Path, tokenizer_dir: Path) -> None:
        import numpy as np
        import onnxruntime as ort
        from transformers import AutoTokenizer

        self._np = np
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(
            str(onnx_path),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = AutoTokenizer.from_pretrained(str(tokenizer_dir))

    def score_pairs(
        self, text: str, surface: str, candidates: Sequence[str]
    ) -> list[tuple[str, float]]:
        if not candidates:
            return []
        rows = [f"{text} [SEP] {surface} [SEP] {cand}" for cand in candidates]
        encoded = self.tokenizer(
            rows,
            truncation=True,
            padding="max_length",
            max_length=128,
            return_tensors="np",
        )
        logits = self.session.run(
            None,
            {
                "input_ids": encoded["input_ids"].astype("int64"),
                "attention_mask": encoded["attention_mask"].astype("int64"),
            },
        )[0]
        pos = logits[:, 1]
        if pos.shape[0] == 1:
            prob = 1.0 / (1.0 + self._np.exp(-pos[0]))
            return [(candidates[0], float(prob))]
        exp = self._np.exp(pos - pos.max())
        rel = exp / exp.sum()
        return [(cand, float(rel[i])) for i, cand in enumerate(candidates)]


class CandidateRerankerTorch:
    def __init__(self, model_dir: str | Path) -> None:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self._torch = torch
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
        self.model.to(self.device)
        self.model.eval()

    def score_pairs(
        self, text: str, surface: str, candidates: Sequence[str]
    ) -> list[tuple[str, float]]:
        if not candidates:
            return []
        rows = [f"{text} [SEP] {surface} [SEP] {cand}" for cand in candidates]
        encoded = self.tokenizer(
            rows,
            truncation=True,
            padding=True,
            max_length=128,
            return_tensors="pt",
        )
        encoded = {k: v.to(self.device) for k, v in encoded.items()}
        with self._torch.no_grad():
            logits = self.model(**encoded).logits
            pos = logits[:, 1]
            if pos.numel() == 1:
                prob = self._torch.sigmoid(pos[0])
                return [(candidates[0], float(prob.item()))]
            rel = self._torch.softmax(pos, dim=0)
        return [(cand, float(rel[i].item())) for i, cand in enumerate(candidates)]


_reranker: CandidateRerankerOnnx | CandidateRerankerTorch | None = None
_load_attempted = False
_reranker_backend = "none"


def get_reranker() -> CandidateRerankerOnnx | CandidateRerankerTorch | None:
    """遅延ロード。ONNX を優先（軽量）。"""
    global _reranker, _load_attempted, _reranker_backend
    if _load_attempted:
        return _reranker
    _load_attempted = True

    model_dir, onnx_path = resolve_reranker_paths()
    prefer_onnx = os.environ.get("YT_FURIGANA_RERANKER_BACKEND", "auto").lower()

    if onnx_path and prefer_onnx in {"auto", "onnx"}:
        tok_dir = onnx_path.parent if onnx_path.parent.name == "onnx" else onnx_path.parent
        if model_dir and (model_dir / "onnx").is_dir():
            tok_dir = model_dir / "onnx"
        try:
            _reranker = CandidateRerankerOnnx(onnx_path, tok_dir)
            _reranker_backend = "onnx"
            print(f"[reading_engine] reranker onnx ← {onnx_path}", file=sys.stderr)
            return _reranker
        except Exception as exc:  # noqa: BLE001
            print(f"[reading_engine] reranker onnx skipped: {exc}", file=sys.stderr)

    if model_dir and (model_dir / "config.json").exists() and prefer_onnx != "onnx":
        try:
            _reranker = CandidateRerankerTorch(model_dir)
            _reranker_backend = "torch"
            print(f"[reading_engine] reranker torch ← {model_dir}", file=sys.stderr)
            return _reranker
        except Exception as exc:  # noqa: BLE001
            print(f"[reading_engine] reranker torch skipped: {exc}", file=sys.stderr)

    _reranker = None
    return None


def reranker_backend() -> str:
    get_reranker()
    return _reranker_backend


def confidence_threshold() -> float:
    raw = os.environ.get("YT_FURIGANA_RERANKER_THRESHOLD", "0.55")
    try:
        return float(raw)
    except ValueError:
        return 0.55
