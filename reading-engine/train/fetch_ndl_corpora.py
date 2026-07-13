#!/usr/bin/env python3
"""Download NDL hurigana corpora into data/.cache (gitignored).

Sources (PD / CC, redistributable for ML):
  - https://github.com/ndl-lab/huriganacorpus-aozora
  - https://github.com/ndl-lab/huriganacorpus-ndlbib
"""

from __future__ import annotations

import argparse
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / ".cache" / "huriganacorpus"

AOZORA_URL = "https://lab.ndl.go.jp/dataset/huriganacorpus/aozora_dataset.zip"
SHOSI_URL = "https://lab.ndl.go.jp/dataset/huriganacorpus/shosi_dataset.zip"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f"exists {dest} ({dest.stat().st_size // (1024 * 1024)} MiB)")
        return
    print(f"download {url} → {dest}")
    subprocess.run(
        ["curl", "-L", "--fail", "--progress-bar", "-o", str(dest), url],
        check=True,
    )


def extract_aozora(zip_path: Path, out_dir: Path) -> None:
    marker = out_dir / "_extracted"
    if marker.exists():
        print(f"aozora already extracted under {out_dir}")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"extract aozora → {out_dir}")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(out_dir)
    marker.write_text("ok\n", encoding="utf-8")


def extract_shosi_subset(zip_path: Path, out_dir: Path, max_files: int) -> None:
    """Shosi is ~10GB uncompressed; pull only the smallest N TSV files."""
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        members = [
            info
            for info in zf.infolist()
            if info.filename.endswith(".txt") and "tsv_file" in info.filename
        ]
        members.sort(key=lambda i: i.file_size)
        chosen = members[:max_files]
        for info in chosen:
            dest = out_dir / Path(info.filename).name
            if dest.exists() and dest.stat().st_size == info.file_size:
                print(f"skip {dest.name}")
                continue
            print(f"extract {info.filename} ({info.file_size // (1024 * 1024)} MiB)")
            with zf.open(info) as src, dest.open("wb") as dst:
                while True:
                    chunk = src.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--shosi-files", type=int, default=3, help="Smallest N shosi TSVs")
    parser.add_argument("--skip-shosi", action="store_true")
    args = parser.parse_args()

    aozora_zip = CACHE / "aozora_dataset.zip"
    shosi_zip = CACHE / "shosi_dataset.zip"
    download(AOZORA_URL, aozora_zip)
    extract_aozora(aozora_zip, CACHE / "aozora")

    if not args.skip_shosi:
        download(SHOSI_URL, shosi_zip)
        extract_shosi_subset(shosi_zip, CACHE / "shosi" / "subset", args.shosi_files)

    print("done")


if __name__ == "__main__":
    main()
