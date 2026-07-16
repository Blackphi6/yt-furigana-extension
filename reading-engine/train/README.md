# Fine-tuning path (Phase 2) — NDL + candidate-constrained ModernBERT

Yomikata is the best *ready* open heteronym model, but it pins `torch==1.13.1`
and does not install cleanly on current macOS ARM + Python 3.11/3.12.

This repo implements candidate-constrained reading:
candidate lattice → rerank → confidence fallback. Readings never leave the lattice.

## Data (legal / redistributable)

| Source | License | Script |
|--------|---------|--------|
| [NDL 青空振り仮名](https://github.com/ndl-lab/huriganacorpus-aozora) | PD works | `fetch_ndl_corpora.py` |
| [NDL 書誌振り仮名](https://github.com/ndl-lab/huriganacorpus-ndlbib) | CC BY 4.0 | same (smallest N TSV) |
| `data/learning/reranker-smoke.jsonl` + seed-bench | in-repo | upsampled after build |

Gates applied in `build_ndl_train.py`:

1. **Token boundary** — only wakachi tokens from the corpus (no「預金」→「金」)
2. **Lattice membership** — gold must be in `heteronym-candidates.json`
3. **Dakuten-only pairs dropped** — NDL fuzzy-match noise
4. **Modern seed upsample** — avoid literary「市場=いちば」collapse

Cached zips / extracts live under `data/.cache/huriganacorpus/` (gitignored).
Generated JSONL (`reranker-ndl*.jsonl`) is also gitignored.

## One-shot

```bash
npm run learn:ndl-fetch   # download + extract
npm run learn:ndl-build   # → data/learning/reranker-ndl.jsonl
npm run learn:ndl-train   # ModernBERT-ja-30m + holdout gate → artifacts/reranker-prod
# or: npm run learn:ndl

export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod
npm run reading-engine
```

Eval gate: holdout accuracy must be ≥ `--min-holdout` and must not regress vs
the previous `reranker-prod/train-meta.json`. Failed runs keep `reranker-ndl/`
but do **not** overwrite prod.

## Smoke (tiny)

```bash
npm run learn:reranker-dry
npm run learn:reranker-smoke
```

Do **not** train on commercial LLM API outputs if you want redistributable weights.
Idioms like 下手に出る stay in `trust_patterns.py`, not LLM judges.
