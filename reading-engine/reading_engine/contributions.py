"""Anonymous reading corrections → shared readings pack (free).

Pack = curated seed (LLM/learned phrases, no subtitle text) + vote aggregation.
Votes override curated on the same surface when they meet min_votes.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "premium"
CONTRIBUTIONS_FILE = DATA_DIR / "contributions.jsonl"
SHARED_READINGS_FILE = DATA_DIR / "shared-readings.json"
CURATED_FILE = DATA_DIR / "shared-readings-curated.json"

# Bundled in Docker image / repo (phrases only — never full captions)
DEFAULT_SEED_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "generated"
    / "shared-readings-seed.json"
)

MAX_SURFACE = 32
MAX_READING = 48
MAX_CONTEXT = 16

SURFACE_RE = re.compile(
    r"^[\u3400-\u9fff\uF900-\uFAFF々〻"
    r"\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$"
)
READING_RE = re.compile(r"^[\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$")


def _utcnow() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def min_votes() -> int:
    raw = os.environ.get("YT_FURIGANA_CONTRIB_MIN_VOTES", "3")
    try:
        return max(1, int(raw))
    except ValueError:
        return 3


def seed_path() -> Path:
    raw = os.environ.get("YT_FURIGANA_SHARED_READINGS_SEED", "").strip()
    if raw:
        return Path(raw)
    return DEFAULT_SEED_PATH


def ensure_contrib_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CONTRIBUTIONS_FILE.exists():
        CONTRIBUTIONS_FILE.write_text("", encoding="utf-8")
    if not CURATED_FILE.exists():
        CURATED_FILE.write_text(
            json.dumps(
                {"entries": {}, "revisedAt": _utcnow()},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    if not SHARED_READINGS_FILE.exists():
        SHARED_READINGS_FILE.write_text(
            json.dumps(
                {
                    "entries": {},
                    "revisedAt": _utcnow(),
                    "source": "contributions+curated",
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )


def clip_context(value: str | None, limit: int = MAX_CONTEXT) -> str:
    text = str(value or "").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[:limit]


def validate_pair(surface: str, reading: str) -> tuple[str, str]:
    surf = str(surface or "").strip()
    read = str(reading or "").strip()
    if not surf or not read:
        raise ValueError("surface_and_reading_required")
    if len(surf) > MAX_SURFACE or len(read) > MAX_READING:
        raise ValueError("too_long")
    if not SURFACE_RE.match(surf):
        raise ValueError("invalid_surface")
    if not READING_RE.match(read):
        raise ValueError("invalid_reading")
    return surf, read


def validate_contribution(
    surface: str,
    reading: str,
    context_left: str = "",
    context_right: str = "",
) -> dict[str, str]:
    surf, read = validate_pair(surface, reading)
    return {
        "surface": surf,
        "reading": read,
        "contextLeft": clip_context(context_left),
        "contextRight": clip_context(context_right),
    }


def normalize_entries(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        try:
            surf, read = validate_pair(str(key), str(value))
        except ValueError:
            continue
        out[surf] = read
    return out


def load_curated_entries() -> dict[str, str]:
    ensure_contrib_store()
    try:
        data = json.loads(CURATED_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return normalize_entries(data.get("entries"))


def save_curated_entries(entries: dict[str, str]) -> dict[str, Any]:
    ensure_contrib_store()
    clean = normalize_entries(entries)
    payload = {"entries": clean, "revisedAt": _utcnow(), "source": "curated"}
    CURATED_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def load_seed_entries() -> dict[str, str]:
    path = seed_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return normalize_entries(data.get("entries") or data.get("phrases") or {})


def bootstrap_curated_from_seed(*, force: bool = False) -> dict[str, str]:
    """Load image/repo seed into curated when empty (or force)."""
    ensure_contrib_store()
    current = load_curated_entries()
    if current and not force:
        return current
    seed = load_seed_entries()
    if not seed:
        return current
    merged = dict(current)
    merged.update(seed)
    save_curated_entries(merged)
    return merged


def merge_curated_entries(
    incoming: dict[str, str],
    *,
    replace: bool = False,
) -> dict[str, Any]:
    """Merge or replace curated phrases, then rebuild the public pack."""
    clean = normalize_entries(incoming)
    if replace:
        curated = clean
    else:
        curated = load_curated_entries()
        curated.update(clean)
    save_curated_entries(curated)
    pack = rebuild_shared_readings()
    return {"ok": True, "curatedCount": len(curated), "pack": pack}


def append_contribution(entry: dict[str, str]) -> dict[str, Any]:
    ensure_contrib_store()
    row = {**entry, "ts": _utcnow()}
    line = json.dumps(row, ensure_ascii=False) + "\n"
    CONTRIBUTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CONTRIBUTIONS_FILE.open("a+", encoding="utf-8") as fh:
        try:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        except (ImportError, OSError):
            pass
        fh.write(line)
        fh.flush()
        try:
            import fcntl

            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        except (ImportError, OSError):
            pass
    pack = rebuild_shared_readings()
    return {"ok": True, "accepted": True, "pack": pack}


def iter_contribution_rows() -> list[dict[str, Any]]:
    ensure_contrib_store()
    rows: list[dict[str, Any]] = []
    if not CONTRIBUTIONS_FILE.exists():
        return rows
    for line in CONTRIBUTIONS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def aggregate_entries(
    rows: list[dict[str, Any]] | None = None,
    *,
    threshold: int | None = None,
) -> dict[str, str]:
    """(surface, reading) 票数で勝ち読みを選ぶ。"""
    thr = min_votes() if threshold is None else max(1, int(threshold))
    counts: Counter[tuple[str, str]] = Counter()
    for row in rows if rows is not None else iter_contribution_rows():
        surface = str(row.get("surface") or "").strip()
        reading = str(row.get("reading") or "").strip()
        if not surface or not reading:
            continue
        counts[(surface, reading)] += 1

    by_surface: dict[str, list[tuple[int, str]]] = {}
    for (surface, reading), count in counts.items():
        if count < thr:
            continue
        by_surface.setdefault(surface, []).append((count, reading))

    entries: dict[str, str] = {}
    for surface, options in by_surface.items():
        options.sort(key=lambda item: (-item[0], item[1]))
        entries[surface] = options[0][1]
    return entries


def rebuild_shared_readings(*, threshold: int | None = None) -> dict[str, Any]:
    ensure_contrib_store()
    bootstrap_curated_from_seed(force=False)
    curated = load_curated_entries()
    votes = aggregate_entries(threshold=threshold)
    # curated is authoritative; votes only fill surfaces curated does not cover
    entries = dict(votes)
    entries.update(curated)
    payload = {
        "entries": entries,
        "revisedAt": _utcnow(),
        "source": "curated+contributions",
        "minVotes": min_votes() if threshold is None else max(1, int(threshold)),
        "curatedCount": len(curated),
        "voteCount": len(votes),
    }
    SHARED_READINGS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def get_shared_readings_pack() -> dict[str, Any]:
    ensure_contrib_store()
    bootstrap_curated_from_seed(force=False)
    try:
        data = json.loads(SHARED_READINGS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return rebuild_shared_readings()
    if not isinstance(data, dict):
        return rebuild_shared_readings()
    entries = data.get("entries")
    if not isinstance(entries, dict) or not entries:
        return rebuild_shared_readings()
    return {
        "entries": {str(k): str(v) for k, v in entries.items() if k and v},
        "revisedAt": data.get("revisedAt") or _utcnow(),
        "source": data.get("source") or "contributions+curated",
        "minVotes": data.get("minVotes") or min_votes(),
        "curatedCount": data.get("curatedCount"),
        "voteCount": data.get("voteCount"),
    }
