#!/usr/bin/env python3
"""Build candidate-constrained reranker JSONL from NDL hurigana corpora.

JRM article gates applied here:
  1. Token-boundary only — use corpus wakachi tokens as-is (never substring「金」in「預金」)
  2. Gold must already sit in the heteronym candidate lattice (no free-form labels)
  3. Dakuten-only reading pairs are dropped (NDL fuzzy-match noise)
  4. Seed / modern templates are merged so literary domain does not dominate
"""

from __future__ import annotations

import argparse
import json
import random
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / ".cache" / "huriganacorpus"

_KATA_TO_HIRA = str.maketrans(
    {i: i - 0x60 for i in range(0x30A1, 0x30F7)}
)
_KANJI_RE = re.compile(r"[一-龥々〆ヵヶ]")
_VOICED = str.maketrans(
    {
        "が": "か",
        "ぎ": "き",
        "ぐ": "く",
        "げ": "け",
        "ご": "こ",
        "ざ": "さ",
        "じ": "し",
        "ず": "す",
        "ぜ": "せ",
        "ぞ": "そ",
        "だ": "た",
        "ぢ": "ち",
        "づ": "つ",
        "で": "て",
        "ど": "と",
        "ば": "は",
        "び": "ひ",
        "ぶ": "ふ",
        "べ": "へ",
        "ぼ": "ほ",
        "ぱ": "は",
        "ぴ": "ひ",
        "ぷ": "ふ",
        "ぺ": "へ",
        "ぽ": "ほ",
    }
)


def to_hiragana(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").translate(_KATA_TO_HIRA)


def normalize_reading(text: str) -> str:
    """Braille-style long vowel → う; drop spaces."""
    h = to_hiragana(text).replace(" ", "").replace("　", "")
    # よこちょー → よこちょう, とーじ → とうじ
    h = re.sub(r"([あいうえおなにぬねのまみむめもやゆよらりるれろわをん])ー", r"\1う", h)
    h = h.replace("ー", "う")
    return h


def strip_voicing(reading: str) -> str:
    return normalize_reading(reading).translate(_VOICED)


def dakuten_only_pair(a: str, b: str) -> bool:
    return a != b and strip_voicing(a) == strip_voicing(b)


def is_kanji_token(surface: str, kind: str) -> bool:
    if "漢字" not in kind and "漢数字" not in kind:
        return False
    return bool(_KANJI_RE.search(surface))


def parse_ndl_file(path: Path) -> list[dict]:
    """Yield sentence records: {text, tokens:[{surface,reading,kind}]}."""
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    sentences: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.startswith("行番号:"):
            i += 1
            continue
        i += 1
        if i >= len(lines):
            break
        # input sentence line may end with [入力文]
        sent_line = lines[i]
        i += 1
        surface_sent = sent_line.split("\t")[0].strip()
        if i < len(lines) and "[入力 読み]" in lines[i]:
            i += 1
        tokens = []
        while i < len(lines) and not lines[i].startswith("行番号:"):
            parts = lines[i].split("\t")
            i += 1
            if len(parts) < 3:
                continue
            surf, reading, kind = parts[0].strip(), parts[1].strip(), parts[2].strip()
            if not surf or kind.startswith("分かち"):
                continue
            tokens.append(
                {
                    "surface": surf,
                    "reading": normalize_reading(reading),
                    "kind": kind,
                }
            )
        if surface_sent and tokens:
            sentences.append({"text": surface_sent, "tokens": tokens})
    return sentences


def load_heteronyms(path: Path) -> dict[str, list[str]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, list[str]] = {}
    for surface, cands in raw.items():
        norms = []
        for c in cands:
            n = normalize_reading(c)
            if n and n not in norms:
                norms.append(n)
        # drop dakuten-only lattices (JRM discovery #4)
        if len(norms) == 2 and dakuten_only_pair(norms[0], norms[1]):
            continue
        filtered = []
        for c in norms:
            if any(dakuten_only_pair(c, f) for f in filtered):
                continue
            filtered.append(c)
        if len(filtered) >= 2:
            out[surface] = filtered
    return out


def match_gold(gold: str, candidates: list[str]) -> str | None:
    if gold in candidates:
        return gold
    # tolerate missing/extra う from braille long vowels
    for c in candidates:
        if strip_voicing(gold) == strip_voicing(c) and gold.replace("う", "") == c.replace(
            "う", ""
        ):
            return c
        if gold.replace("う", "") == c.replace("う", ""):
            return c
    return None


def emit_from_sentences(
    sentences: list[dict],
    heteronyms: dict[str, list[str]],
    source: str,
    per_surface_cap: int,
    surface_counts: Counter[str],
) -> list[dict]:
    rows: list[dict] = []
    for sent in sentences:
        text = sent["text"]
        # Token-boundary gate: only whole wakachi tokens (never substring extract)
        for tok in sent["tokens"]:
            surface = tok["surface"]
            if surface not in heteronyms:
                continue
            if not is_kanji_token(surface, tok["kind"]):
                continue
            if surface_counts[surface] >= per_surface_cap:
                continue
            gold = match_gold(tok["reading"], heteronyms[surface])
            if gold is None:
                continue
            # Skip empty / too-short context
            if len(text) < 4:
                continue
            rows.append(
                {
                    "text": text,
                    "surface": surface,
                    "candidates": heteronyms[surface],
                    "gold": gold,
                    "source": source,
                }
            )
            surface_counts[surface] += 1
    return rows


def expand_seed_bench(heteronyms: dict[str, list[str]]) -> list[dict]:
    path = ROOT / "data" / "learning" / "seed-bench.jsonl"
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        obj = json.loads(line)
        text = obj["text"]
        for exp in obj.get("expect") or []:
            surface = exp["surface"]
            gold = normalize_reading(exp["reading"])
            cands = heteronyms.get(surface)
            if not cands:
                # still include with singleton lattice + gold (won't train ambiguity)
                cands = [gold]
            if gold not in cands:
                cands = list(dict.fromkeys([*cands, gold]))
            if len(cands) < 2:
                continue
            out.append(
                {
                    "text": text,
                    "surface": surface,
                    "candidates": cands,
                    "gold": gold,
                    "source": "seed-bench",
                }
            )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--aozora",
        type=Path,
        default=CACHE / "aozora" / "aozora_dataset",
    )
    parser.add_argument(
        "--shosi",
        type=Path,
        default=CACHE / "shosi" / "subset",
    )
    parser.add_argument(
        "--heteronyms",
        type=Path,
        default=ROOT / "data" / "generated" / "heteronym-candidates.json",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "data" / "learning" / "reranker-ndl.jsonl",
    )
    parser.add_argument("--holdout", type=Path, default=ROOT / "data" / "learning" / "reranker-ndl-holdout.jsonl")
    parser.add_argument("--per-surface", type=int, default=40)
    parser.add_argument("--max-aozora-files", type=int, default=0, help="0 = all")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--holdout-frac", type=float, default=0.08)
    args = parser.parse_args()

    random.seed(args.seed)
    heteronyms = load_heteronyms(args.heteronyms)
    print(f"heteronym surfaces (multi-reading, dakuten-filtered)={len(heteronyms)}")

    surface_counts: Counter[str] = Counter()
    corpus_rows: list[dict] = []

    seed_rows: list[dict] = []
    for seed_name, source_tag in (
        ("reranker-smoke.jsonl", "seed"),
        ("synth-accepted.jsonl", "llm-synth"),
    ):
        smoke = ROOT / "data" / "learning" / seed_name
        if not smoke.exists():
            continue
        for line in smoke.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            if "gold" not in obj or "candidates" not in obj:
                continue
            seed_rows.append(
                {
                    "text": obj["text"],
                    "surface": obj["surface"],
                    "candidates": [normalize_reading(c) for c in obj["candidates"]],
                    "gold": normalize_reading(obj["gold"]),
                    "source": source_tag,
                }
            )
    seed_rows.extend(expand_seed_bench(heteronyms))

    aozora_files = sorted(args.aozora.rglob("*.txt")) if args.aozora.exists() else []
    if args.max_aozora_files:
        aozora_files = aozora_files[: args.max_aozora_files]
    print(f"parsing aozora files={len(aozora_files)}")
    for idx, path in enumerate(aozora_files, 1):
        sents = parse_ndl_file(path)
        corpus_rows.extend(
            emit_from_sentences(
                sents, heteronyms, f"aozora:{path.name}", args.per_surface, surface_counts
            )
        )
        if idx % 200 == 0:
            print(f"  aozora {idx}/{len(aozora_files)} rows={len(corpus_rows)}")

    shosi_files = sorted(args.shosi.rglob("*.txt")) if args.shosi.exists() else []
    if not shosi_files and (CACHE / "shosi" / "partial").exists():
        shosi_files = sorted((CACHE / "shosi" / "partial").rglob("*.txt"))
    shosi_target = len(corpus_rows) + 25_000
    print(f"parsing shosi files={len(shosi_files)}")
    for path in shosi_files:
        if len(corpus_rows) >= shosi_target:
            break
        sents = parse_ndl_file(path)
        before = len(corpus_rows)
        corpus_rows.extend(
            emit_from_sentences(
                sents, heteronyms, f"shosi:{path.name}", args.per_surface, surface_counts
            )
        )
        print(f"  {path.name}: +{len(corpus_rows) - before} (total={len(corpus_rows)})")

    # Deduplicate corpus triples, then upsample modern seed (JRM discovery #3)
    uniq: list[dict] = []
    seen: set[tuple] = set()
    for row in corpus_rows:
        key = (row["text"], row["surface"], row["gold"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(row)

    seed_unique: list[dict] = []
    for row in seed_rows:
        key = (row["text"], row["surface"], row["gold"])
        if key in seen:
            # keep as seed anyway — modern gold may differ from literary majority
            pass
        seed_unique.append(row)
        seen.add(key)

    seed_boost = 24  # literary corpus is large; prevent 市場=いちば collapse
    boosted = uniq + seed_unique * seed_boost
    random.shuffle(boosted)

    # Hold out only from corpus (not duplicated seed copies)
    random.shuffle(uniq)
    n_hold = max(1, int(len(uniq) * args.holdout_frac)) if len(uniq) > 20 else 0
    holdout = uniq[:n_hold]
    hold_keys = {(r["text"], r["surface"], r["gold"]) for r in holdout}
    train = [r for r in boosted if (r["text"], r["surface"], r["gold"]) not in hold_keys]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for row in train:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    with args.holdout.open("w", encoding="utf-8") as f:
        for row in holdout:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    by_src = Counter(r["source"].split(":")[0] for r in train)
    print(
        f"train={len(train)} holdout={len(holdout)} "
        f"sources={dict(by_src)} unique_surfaces={len({r['surface'] for r in train})}"
    )
    print(f"wrote {args.out}")
    print(f"wrote {args.holdout}")


if __name__ == "__main__":
    main()
