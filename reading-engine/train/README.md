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

## Smoke train (一度回す)

```bash
# ルール学習（拡張に即反映）
npm run learn
npm run build

# 候補制約 reranker の超小規模 smoke（任意）
.venv-reading/bin/pip install transformers datasets accelerate torch
.venv-reading/bin/python reading-engine/train/train_reranker_smoke.py --dry-run
.venv-reading/bin/python reading-engine/train/train_reranker_smoke.py --max-steps 20
```

Do **not** train on commercial LLM API outputs if you want redistributable weights
(same caution as the JRM article). Open-weight generate→verify→arbitrate across
model families only; idioms like 下手に出る should be regex/trust tables, not LLM judges.

Install (when training):

```bash
source .venv-reading/bin/activate
pip install transformers datasets accelerate
```
