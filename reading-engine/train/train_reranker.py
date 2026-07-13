#!/usr/bin/env python3
"""Candidate-constrained ModernBERT train + eval gate (JRM Phase 2).

Loss: softmax over *candidates only* for each (text, surface) — never free-form.
Eval / promote: seed smoke accuracy + NDL holdout floor; refuse regression.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import Dataset

ROOT = Path(__file__).resolve().parents[2]


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


class LatticeDataset(Dataset):
    def __init__(self, rows: list[dict], tokenizer, max_length: int = 128):
        self.rows = [r for r in rows if r.get("gold") in (r.get("candidates") or [])]
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int) -> dict:
        row = self.rows[idx]
        cands = list(row["candidates"])
        gold_i = cands.index(row["gold"])
        texts = [f"{row['text']} [SEP] {row['surface']} [SEP] {c}" for c in cands]
        enc = self.tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt",
        )
        return {
            "input_ids": enc["input_ids"],
            "attention_mask": enc["attention_mask"],
            "gold_index": gold_i,
            "n_cand": len(cands),
        }


def collate_lattice(batch: list[dict]) -> dict:
    max_c = max(b["n_cand"] for b in batch)
    bsz = len(batch)
    length = batch[0]["input_ids"].size(1)
    input_ids = torch.zeros(bsz, max_c, length, dtype=torch.long)
    attention_mask = torch.zeros(bsz, max_c, length, dtype=torch.long)
    gold = torch.zeros(bsz, dtype=torch.long)
    cand_mask = torch.zeros(bsz, max_c, dtype=torch.bool)
    for i, b in enumerate(batch):
        n = b["n_cand"]
        input_ids[i, :n] = b["input_ids"]
        attention_mask[i, :n] = b["attention_mask"]
        gold[i] = b["gold_index"]
        cand_mask[i, :n] = True
    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "gold_index": gold,
        "cand_mask": cand_mask,
    }


def score_batch(model, batch: dict, device: torch.device) -> torch.Tensor:
    """Return [B, C] logits for label=1 (positive reading)."""
    ids = batch["input_ids"].to(device)
    mask = batch["attention_mask"].to(device)
    bsz, n_cand, length = ids.shape
    flat_ids = ids.view(bsz * n_cand, length)
    flat_mask = mask.view(bsz * n_cand, length)
    logits = model(input_ids=flat_ids, attention_mask=flat_mask).logits
    # binary head → use logit for class 1
    pos = logits[:, 1].view(bsz, n_cand)
    return pos


def lattice_loss(pos_logits: torch.Tensor, gold: torch.Tensor, cand_mask: torch.Tensor) -> torch.Tensor:
    masked = pos_logits.masked_fill(~cand_mask, -1e4)
    return F.cross_entropy(masked, gold.to(pos_logits.device))


@torch.no_grad()
def evaluate(model, tokenizer, rows: list[dict], device: torch.device) -> dict:
    correct = 0
    total = 0
    model.eval()
    for row in rows:
        cands = row["candidates"]
        gold = row["gold"]
        if gold not in cands or len(cands) < 2:
            continue
        inputs = [f"{row['text']} [SEP] {row['surface']} [SEP] {c}" for c in cands]
        encoded = tokenizer(
            inputs,
            truncation=True,
            padding=True,
            max_length=128,
            return_tensors="pt",
        )
        encoded = {k: v.to(device) for k, v in encoded.items()}
        logits = model(**encoded).logits
        probs = torch.softmax(logits, dim=-1)[:, 1]
        pred = cands[int(probs.argmax().item())]
        correct += int(pred == gold)
        total += 1
    return {
        "correct": correct,
        "total": total,
        "accuracy": correct / total if total else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--train",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-ndl.jsonl",
    )
    parser.add_argument(
        "--holdout",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-ndl-holdout.jsonl",
    )
    parser.add_argument(
        "--seed-eval",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-smoke.jsonl",
    )
    parser.add_argument("--model", default="sbintuitions/modernbert-ja-30m")
    parser.add_argument(
        "--init-from",
        type=Path,
        default=None,
        help="Continue from a previous fine-tune directory",
    )
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-steps", type=int, default=0, help="0 = full epochs")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-train-rows", type=int, default=30000)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "reading-engine" / "train" / "artifacts" / "reranker-ndl",
    )
    parser.add_argument(
        "--promote-dir",
        type=Path,
        default=ROOT / "reading-engine" / "train" / "artifacts" / "reranker-prod",
    )
    parser.add_argument("--min-holdout", type=float, default=0.50)
    parser.add_argument("--min-seed", type=float, default=0.70)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-promote", action="store_true")
    args = parser.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    if not args.train.exists():
        raise SystemExit(
            f"missing {args.train}\n"
            "Run: npm run learn:ndl-fetch && npm run learn:ndl-build"
        )

    rows = load_jsonl(args.train)
    holdout = load_jsonl(args.holdout) if args.holdout.exists() else []
    seed_rows = load_jsonl(args.seed_eval) if args.seed_eval.exists() else []
    covered = sum(1 for r in rows if r.get("gold") in (r.get("candidates") or []))
    print(
        f"train_rows={len(rows)} gold_in_lattice={covered}/{len(rows)} "
        f"holdout={len(holdout)} seed={len(seed_rows)}"
    )
    if args.dry_run:
        print("dry-run ok")
        return

    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    # Prefer seed / shosi / modern-domain rows, then fill from aozora
    preferred = [r for r in rows if r.get("source", "").split(":")[0] in {"seed", "seed-bench", "shosi"}]
    aozora = [r for r in rows if r.get("source", "").startswith("aozora")]
    random.shuffle(aozora)
    train_rows = preferred + aozora
    if args.max_train_rows and len(train_rows) > args.max_train_rows:
        # keep all preferred, fill remainder from aozora
        need = max(0, args.max_train_rows - len(preferred))
        train_rows = preferred + aozora[:need]
    print(f"using_train_rows={len(train_rows)} preferred={len(preferred)}")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    init = str(args.init_from) if args.init_from and args.init_from.exists() else args.model
    print(f"init_from={init}")
    model = AutoModelForSequenceClassification.from_pretrained(init, num_labels=2)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model.to(device)

    ds = LatticeDataset(train_rows, tokenizer)
    loader = torch.utils.data.DataLoader(
        ds,
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate_lattice,
    )
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    args.out.mkdir(parents=True, exist_ok=True)
    step = 0
    model.train()
    for epoch in range(args.epochs):
        for batch in loader:
            opt.zero_grad(set_to_none=True)
            pos = score_batch(model, batch, device)
            loss = lattice_loss(pos, batch["gold_index"], batch["cand_mask"].to(device))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            step += 1
            if step % 100 == 0:
                print(f"epoch={epoch+1} step={step} loss={loss.item():.4f}")
            if args.max_steps and step >= args.max_steps:
                break
        if args.max_steps and step >= args.max_steps:
            break

    model.save_pretrained(str(args.out))
    tokenizer.save_pretrained(str(args.out))

    hold_eval = holdout[:1200] if holdout else train_rows[:200]
    metrics = evaluate(model, tokenizer, hold_eval, device)
    seed_metrics = evaluate(model, tokenizer, seed_rows, device) if seed_rows else {
        "accuracy": 0.0,
        "correct": 0,
        "total": 0,
    }
    print(
        f"holdout accuracy={metrics['accuracy']:.3f} "
        f"({metrics['correct']}/{metrics['total']})"
    )
    print(
        f"seed accuracy={seed_metrics['accuracy']:.3f} "
        f"({seed_metrics['correct']}/{seed_metrics['total']})"
    )

    prev_meta_path = args.promote_dir / "train-meta.json"
    prev = json.loads(prev_meta_path.read_text(encoding="utf-8")) if prev_meta_path.exists() else {}
    prev_seed = prev.get("seed_accuracy")

    gate_ok = (
        metrics["accuracy"] >= args.min_holdout
        and seed_metrics["accuracy"] >= args.min_seed
    )
    if prev_seed is not None and seed_metrics["accuracy"] + 1e-9 < float(prev_seed):
        gate_ok = False
        print(f"GATE FAIL: seed {seed_metrics['accuracy']:.3f} < previous {prev_seed:.3f}")
    elif not gate_ok:
        print(
            f"GATE FAIL: holdout={metrics['accuracy']:.3f} (min {args.min_holdout}) "
            f"seed={seed_metrics['accuracy']:.3f} (min {args.min_seed})"
        )
    else:
        print("GATE PASS")

    meta = {
        "model": args.model,
        "train": str(args.train),
        "train_rows_used": len(train_rows),
        "steps": step,
        "epochs": args.epochs,
        "loss": "lattice_softmax",
        "holdout_accuracy": metrics["accuracy"],
        "holdout_correct": metrics["correct"],
        "holdout_total": metrics["total"],
        "seed_accuracy": seed_metrics["accuracy"],
        "seed_correct": seed_metrics["correct"],
        "seed_total": seed_metrics["total"],
        "gate_ok": gate_ok,
        "previous_seed_accuracy": prev_seed,
    }
    (args.out / "train-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    if gate_ok and not args.no_promote:
        args.promote_dir.mkdir(parents=True, exist_ok=True)
        # Save directly (avoid copytree races on external volumes)
        model.save_pretrained(str(args.promote_dir))
        tokenizer.save_pretrained(str(args.promote_dir))
        (args.promote_dir / "train-meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"promoted → {args.promote_dir}")
        print(f"export YT_FURIGANA_RERANKER_PATH={args.promote_dir}")
    elif args.no_promote:
        print("skip promote (--no-promote)")
    else:
        print("not promoted (eval gate)")


if __name__ == "__main__":
    main()
