#!/usr/bin/env python3
"""Minimal candidate-constrained ModernBERT reranker smoke trainer.

Design (candidate-constrained / g2p-style selection):
  lattice of readings from dict → classify among candidates only
  → low confidence falls back to dictionary reading
  → never free-form LLM generation

This script is a *smoke* loop on tiny JSONL so we can run once locally.
For full NDL / Aozora scale, point --train at a larger file.

Example:
  source .venv-reading/bin/activate
  pip install transformers datasets accelerate torch
  python reading-engine/train/train_reranker_smoke.py \\
    --train data/learning/reranker-smoke.jsonl \\
    --epochs 1 --max-steps 20
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--train",
        type=Path,
        default=ROOT / "data/learning/reranker-smoke.jsonl",
    )
    parser.add_argument(
        "--model",
        default="sbintuitions/modernbert-ja-30m",
        help="Candidate-constrained reranker base",
    )
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--max-steps", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "reading-engine/train/artifacts/reranker-smoke",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only validate dataset / print lattice stats (no torch)",
    )
    args = parser.parse_args()

    random.seed(args.seed)
    rows = load_jsonl(args.train)
    if not rows:
        raise SystemExit(f"empty train file: {args.train}")

    covered = 0
    for row in rows:
        cands = row.get("candidates") or []
        gold = row.get("gold")
        if gold in cands:
            covered += 1
        else:
            print(f"WARN gold not in lattice: {row.get('surface')} gold={gold} cands={cands}")

    print(
        f"rows={len(rows)} gold_in_lattice={covered}/{len(rows)} "
        f"({100 * covered / len(rows):.1f}%)"
    )
    if args.dry_run:
        print("dry-run ok — install transformers/torch to train for real")
        return

    try:
        import torch
        from datasets import Dataset
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
    except ImportError as exc:
        raise SystemExit(
            "Missing ML deps. Run:\n"
            "  .venv-reading/bin/pip install transformers datasets accelerate torch\n"
            f"Original error: {exc}"
        ) from exc

    # One logit per example's chosen candidate index is awkward for variable
    # candidate sets; smoke uses binary: score (text, surface, candidate)
    # and train with label 1 for gold / 0 for other candidates.
    examples = []
    for row in rows:
        text = row["text"]
        surface = row["surface"]
        gold = row["gold"]
        for cand in row["candidates"]:
            examples.append(
                {
                    "text": f"{text} [SEP] {surface} [SEP] {cand}",
                    "label": 1 if cand == gold else 0,
                }
            )

    random.shuffle(examples)
    ds = Dataset.from_list(examples)
    tokenizer = AutoTokenizer.from_pretrained(args.model)

    def tokenize_batch(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding="max_length",
            max_length=128,
        )

    tokenized = ds.map(tokenize_batch, batched=True)
    tokenized = tokenized.rename_column("label", "labels")
    tokenized.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    model = AutoModelForSequenceClassification.from_pretrained(args.model, num_labels=2)
    args.out.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(args.out),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=4,
        logging_steps=5,
        save_strategy="no",
        report_to=[],
        learning_rate=5e-5,
    )
    trainer = Trainer(model=model, args=training_args, train_dataset=tokenized)
    trainer.train()
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    meta = {
        "model": args.model,
        "train": str(args.train),
        "rows": len(rows),
        "pair_examples": len(examples),
        "gold_in_lattice_pct": 100 * covered / len(rows),
    }
    (args.out / "smoke-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"saved → {args.out}")


if __name__ == "__main__":
    main()
