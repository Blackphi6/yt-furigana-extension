# Fine-tuning path (Phase 2)

Yomikata is the best *ready* open heteronym model, but it pins `torch==1.13.1`
and does not install cleanly on current macOS ARM + Python 3.11/3.12.

Recommended base for a JRM-style reranker (candidate constrained):

1. `sbintuitions/modernbert-ja-30m` (fast iterate) or `modernbert-ja-130m` (quality)
2. Labels from:
   - NDL Aozora / bibliographic furigana corpora (PD / CC)
   - Synthetic templates for 辛い/市場/空/大事…
   - Community creative-ruby JSONL (separate head or tag)
3. Loss: classify among *candidates only* (not free-form generation)
4. Eval gate: keep seed-bench; refuse merge if score drops

Install (when training):

```bash
source .venv-reading/bin/activate
pip install transformers datasets accelerate
```

Do **not** train on commercial LLM API outputs if you want redistributable weights
(same caution as the JRM article).
