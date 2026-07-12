#!/usr/bin/env python3
"""Extract creative-looking ruby pairs from text with 《》 / ｜《》 / HTML <ruby>.

Google search hits prove such readings exist; this script harvests from *your*
local files or stdin (e.g. exported lyrics with ruby), not from scraping SERPs.

Usage:
  python harvest_ruby.py path/to/lyrics.txt >> data/creative-ruby/harvested.jsonl
  cat page.html | python harvest_ruby.py --html >> data/creative-ruby/harvested.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

_KATA_TO_HIRA = str.maketrans({i: i - 0x60 for i in range(0x30A1, 0x30F7)})


def to_hiragana(text: str) -> str:
    return unicodedata.normalize("NFKC", text or "").translate(_KATA_TO_HIRA)


RUBY_PATTERNS = [
    re.compile(r"｜([^《\n]{1,20})《([^》]{1,20})》"),
    re.compile(r"([一-龥々〆ヵヶ]{1,10})《([ぁ-んァ-ヶー・]{1,20})》"),
]

HTML_RUBY = re.compile(
    r"<ruby[^>]*>\s*([^<]+?)\s*<rt[^>]*>\s*([^<]+?)\s*</rt>\s*</ruby>",
    re.I,
)


def extract_from_text(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for pat in RUBY_PATTERNS:
        for m in pat.finditer(text):
            pairs.append((m.group(1).strip(), to_hiragana(m.group(2).strip())))
    return pairs


def extract_from_html(html: str) -> list[tuple[str, str]]:
    pairs = []
    for m in HTML_RUBY.finditer(html):
        pairs.append((m.group(1).strip(), to_hiragana(m.group(2).strip())))
    pairs.extend(extract_from_text(re.sub(r"<[^>]+>", "", html)))
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", help="Input files (default: stdin)")
    parser.add_argument("--html", action="store_true")
    parser.add_argument("--genre", default="lyric")
    args = parser.parse_args()

    chunks: list[str] = []
    if args.paths:
        for p in args.paths:
            chunks.append(Path(p).read_text(encoding="utf-8", errors="ignore"))
    else:
        chunks.append(sys.stdin.read())

    seen: set[tuple[str, str]] = set()
    for chunk in chunks:
        pairs = extract_from_html(chunk) if args.html else extract_from_text(chunk)
        for surface, reading in pairs:
            if not surface or not reading:
                continue
            if not re.search(r"[\u3400-\u9fff]", surface):
                continue
            key = (surface, reading)
            if key in seen:
                continue
            seen.add(key)
            print(
                json.dumps(
                    {
                        "surface": surface,
                        "reading": reading,
                        "genre": args.genre,
                        "note": "harvested",
                        "cues": [],
                    },
                    ensure_ascii=False,
                )
            )


if __name__ == "__main__":
    main()
