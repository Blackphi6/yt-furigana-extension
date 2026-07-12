"""Candidate-constrained ModernBERT reranker (optional).

Never invents readings: scores only the provided candidate list.
Loaded when YT_FURIGANA_RERANKER_PATH points at a fine-tuned directory
(see train/train_reranker_smoke.py / train/README.md).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Sequence


class CandidateReranker:
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
        """Return (candidate, P(label=1)) for each candidate. Never adds new readings."""
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
            probs = self._torch.softmax(logits, dim=-1)[:, 1]
        return [(cand, float(probs[i].item())) for i, cand in enumerate(candidates)]


_reranker: CandidateReranker | None = None
_load_attempted = False


def get_reranker() -> CandidateReranker | None:
    """Lazy-load once. Missing path / deps → None (cue rules remain)."""
    global _reranker, _load_attempted
    if _load_attempted:
        return _reranker
    _load_attempted = True
    path = os.environ.get("YT_FURIGANA_RERANKER_PATH", "").strip()
    # Do not auto-load undertrained smoke weights; require explicit path.
    if not path or not Path(path).exists():
        return None
    try:
        _reranker = CandidateReranker(path)
    except Exception as exc:  # noqa: BLE001
        print(f"[reading_engine] reranker load skipped: {exc}")
        _reranker = None
    return _reranker


def confidence_threshold() -> float:
    raw = os.environ.get("YT_FURIGANA_RERANKER_THRESHOLD", "0.55")
    try:
        return float(raw)
    except ValueError:
        return 0.55
