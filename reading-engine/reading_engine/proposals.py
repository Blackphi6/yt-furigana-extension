"""Demo / public reading proposals — staged only (never auto-published to Free pack).

Flow:
  1. Client POSTs surface→reading pairs → proposals.jsonl (status=pending)
  2. Heuristic (+ optional Groq LLM) review → accepted | rejected | pending
  3. Admin promote accepted → curated → rebuild shared pack

No caption / video URL is stored.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from reading_engine.contributions import (
    DATA_DIR,
    ensure_contrib_store,
    merge_curated_entries,
    normalize_entries,
    validate_pair,
    voter_id_from_ip,
)

PROPOSALS_FILE = DATA_DIR / "proposals.jsonl"

_recent_proposals: dict[str, float] = {}
_recent_lock = Lock()
_file_lock = Lock()


def _utcnow() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def proposal_cooldown_sec() -> float:
    raw = os.environ.get("YT_FURIGANA_PROPOSAL_COOLDOWN_SEC", "60")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 60.0


def max_proposals_per_request() -> int:
    raw = os.environ.get("YT_FURIGANA_PROPOSAL_MAX_PER_REQUEST", "20")
    try:
        return max(1, min(50, int(raw)))
    except ValueError:
        return 20


def auto_curate_accepted() -> bool:
    return os.environ.get("YT_FURIGANA_PROPOSAL_AUTO_CURATE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def llm_review_enabled() -> bool:
    if os.environ.get("YT_FURIGANA_PROPOSAL_LLM", "1").strip().lower() in (
        "0",
        "false",
        "no",
        "off",
    ):
        return False
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def ensure_proposals_store() -> None:
    ensure_contrib_store()
    if not PROPOSALS_FILE.exists():
        PROPOSALS_FILE.write_text("", encoding="utf-8")


def validate_proposal_entries(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        raise ValueError("entries_required")
    limit = max_proposals_per_request()
    if len(raw) > limit:
        raise ValueError("too_many_entries")
    if len(raw) == 0:
        raise ValueError("entries_required")
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            surf, read = validate_pair(
                str(item.get("surface") or ""),
                str(item.get("reading") or ""),
            )
        except ValueError:
            continue
        if surf in seen:
            continue
        seen.add(surf)
        out.append({"surface": surf, "reading": read})
    if not out:
        raise ValueError("no_valid_entries")
    return out


def heuristic_review(surface: str, reading: str) -> dict[str, Any]:
    """Cheap gate before optional LLM. Rejects obvious junk."""
    surf = str(surface or "").strip()
    read = str(reading or "").strip()
    reasons: list[str] = []

    if len(read) > len(surf) * 6 + 4:
        reasons.append("reading_too_long_vs_surface")
    if len(surf) == 1 and len(read) > 6:
        reasons.append("single_char_overlong_reading")
    if surf == read:
        reasons.append("surface_equals_reading")
    if not read:
        reasons.append("empty_reading")

    if reasons:
        return {
            "ok": False,
            "status": "rejected",
            "reason": ",".join(reasons),
            "via": "heuristic",
        }
    return {
        "ok": True,
        "status": "pending",
        "reason": "heuristic_ok",
        "via": "heuristic",
    }


def _groq_review_pair(surface: str, reading: str) -> dict[str, Any]:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return {
            "ok": True,
            "status": "pending",
            "reason": "no_llm_key",
            "via": "none",
        }

    model = os.environ.get(
        "YT_FURIGANA_PROPOSAL_LLM_MODEL", "llama-3.1-8b-instant"
    ).strip()
    prompt = (
        "You review Japanese furigana dictionary proposals for a caption tool.\n"
        "Decide if the reading (hiragana/katakana) is a plausible reading for the surface.\n"
        "Accept common on/kun readings, names, and idioms. Reject jokes, English, "
        "unrelated meanings, or clearly wrong readings.\n"
        f"surface: {surface}\nreading: {reading}\n"
        'Reply with ONLY JSON: {"accept":true|false,"reason":"short"}'
    )
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "max_tokens": 80,
            "messages": [
                {"role": "system", "content": "Return compact JSON only."},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        TimeoutError,
        json.JSONDecodeError,
    ) as exc:
        return {
            "ok": True,
            "status": "pending",
            "reason": f"llm_error:{type(exc).__name__}",
            "via": "llm_error",
        }

    try:
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        accept = bool(parsed.get("accept"))
        reason = str(
            parsed.get("reason") or ("accepted" if accept else "rejected")
        )[:120]
        return {
            "ok": accept,
            "status": "accepted" if accept else "rejected",
            "reason": reason,
            "via": "llm",
        }
    except (KeyError, TypeError, json.JSONDecodeError, IndexError):
        return {
            "ok": True,
            "status": "pending",
            "reason": "llm_parse_error",
            "via": "llm_error",
        }


def review_pair(
    surface: str, reading: str, *, use_llm: bool | None = None
) -> dict[str, Any]:
    heur = heuristic_review(surface, reading)
    if not heur["ok"]:
        return heur
    do_llm = llm_review_enabled() if use_llm is None else bool(use_llm)
    if not do_llm:
        return {
            "ok": True,
            "status": "pending",
            "reason": "awaiting_review",
            "via": "heuristic",
        }
    return _groq_review_pair(surface, reading)


def _append_rows(rows: list[dict[str, Any]]) -> None:
    ensure_proposals_store()
    with _file_lock:
        with PROPOSALS_FILE.open("a+", encoding="utf-8") as fh:
            try:
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            except (ImportError, OSError):
                pass
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            fh.flush()
            try:
                import fcntl

                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
            except (ImportError, OSError):
                pass


def _rewrite_all_rows(rows: list[dict[str, Any]]) -> None:
    ensure_proposals_store()
    with _file_lock:
        text = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
        PROPOSALS_FILE.write_text(text, encoding="utf-8")


def iter_proposal_rows() -> list[dict[str, Any]]:
    ensure_proposals_store()
    rows: list[dict[str, Any]] = []
    if not PROPOSALS_FILE.exists():
        return rows
    for line in PROPOSALS_FILE.read_text(encoding="utf-8").splitlines():
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


def append_proposals(
    entries: list[dict[str, str]],
    *,
    client_ip: str = "",
    source: str = "demo",
    note: str = "",
    use_llm: bool | None = None,
) -> dict[str, Any]:
    """
    Stage proposals. Never writes shared-readings.json directly.
    Same voter is rate-limited by cooldown (batch, not per surface).
    """
    ensure_proposals_store()
    voter = voter_id_from_ip(client_ip)
    cooldown = proposal_cooldown_sec()
    now = time.monotonic()
    with _recent_lock:
        last = _recent_proposals.get(voter, 0.0)
        if cooldown > 0 and now - last < cooldown:
            raise ValueError("proposal_cooldown")
        _recent_proposals[voter] = now

    ts = _utcnow()
    src = str(source or "demo").strip()[:32] or "demo"
    note_clip = str(note or "").replace("\n", " ").strip()[:80]
    stored: list[dict[str, Any]] = []
    summary = {"pending": 0, "accepted": 0, "rejected": 0}

    for entry in entries:
        review = review_pair(entry["surface"], entry["reading"], use_llm=use_llm)
        status = str(review.get("status") or "pending")
        if status not in ("pending", "accepted", "rejected"):
            status = "pending"
        row = {
            "id": f"{voter[:8]}-{ts}-{entry['surface']}-{len(stored)}",
            "surface": entry["surface"],
            "reading": entry["reading"],
            "status": status,
            "reviewVia": review.get("via") or "",
            "reviewReason": str(review.get("reason") or "")[:160],
            "source": src,
            "note": note_clip,
            "voter": voter,
            "ts": ts,
            "promoted": False,
        }
        stored.append(row)
        summary[status] = summary.get(status, 0) + 1

    _append_rows(stored)

    promoted: dict[str, Any] | None = None
    if auto_curate_accepted():
        accepted_map = {
            r["surface"]: r["reading"]
            for r in stored
            if r.get("status") == "accepted"
        }
        if accepted_map:
            promoted = merge_curated_entries(accepted_map, replace=False)
            for r in stored:
                if r.get("status") == "accepted":
                    r["promoted"] = True
            # rewrite promoted flags for just-appended rows (best-effort)
            all_rows = iter_proposal_rows()
            by_id = {r.get("id"): r for r in stored if r.get("id")}
            changed = False
            for row in all_rows:
                rid = row.get("id")
                if rid in by_id and by_id[rid].get("promoted"):
                    row["promoted"] = True
                    changed = True
            if changed:
                _rewrite_all_rows(all_rows)

    return {
        "ok": True,
        "accepted": True,
        "staged": True,
        "published": False,
        "count": len(stored),
        "summary": summary,
        "message": "staged_for_review",
        "llm": llm_review_enabled() if use_llm is None else bool(use_llm),
        "autoCurate": bool(promoted),
        "promoted": promoted,
    }


def list_proposals(
    *,
    status: str | None = None,
    limit: int = 200,
) -> dict[str, Any]:
    rows = iter_proposal_rows()
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows = list(reversed(rows))[: max(1, min(1000, int(limit)))]
    return {"ok": True, "count": len(rows), "proposals": rows}


def process_pending_proposals(
    *,
    use_llm: bool | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Re-review pending rows (admin). Optionally auto-curate accepted."""
    rows = iter_proposal_rows()
    updated = 0
    summary = {"pending": 0, "accepted": 0, "rejected": 0}
    newly_accepted: dict[str, str] = {}

    remaining = max(1, min(200, int(limit)))
    for row in rows:
        if remaining <= 0:
            break
        if row.get("status") != "pending":
            continue
        surface = str(row.get("surface") or "")
        reading = str(row.get("reading") or "")
        if not surface or not reading:
            continue
        review = review_pair(surface, reading, use_llm=use_llm)
        status = str(review.get("status") or "pending")
        if status not in ("pending", "accepted", "rejected"):
            status = "pending"
        row["status"] = status
        row["reviewVia"] = review.get("via") or ""
        row["reviewReason"] = str(review.get("reason") or "")[:160]
        row["reviewedAt"] = _utcnow()
        updated += 1
        remaining -= 1
        summary[status] = summary.get(status, 0) + 1
        if status == "accepted":
            newly_accepted[surface] = reading

    if updated:
        _rewrite_all_rows(rows)

    promoted = None
    if newly_accepted and auto_curate_accepted():
        promoted = merge_curated_entries(newly_accepted, replace=False)
        for row in rows:
            if (
                row.get("surface") in newly_accepted
                and row.get("status") == "accepted"
            ):
                row["promoted"] = True
        _rewrite_all_rows(rows)

    return {
        "ok": True,
        "updated": updated,
        "summary": summary,
        "promoted": promoted,
    }


def promote_accepted_proposals(
    *,
    surfaces: list[str] | None = None,
    mark_promoted: bool = True,
) -> dict[str, Any]:
    """Merge accepted (and not yet promoted) proposals into curated pack."""
    rows = iter_proposal_rows()
    want = {str(s).strip() for s in (surfaces or []) if str(s).strip()}
    entries: dict[str, str] = {}
    for row in rows:
        if row.get("status") != "accepted":
            continue
        if row.get("promoted") and not want:
            continue
        surface = str(row.get("surface") or "").strip()
        reading = str(row.get("reading") or "").strip()
        if not surface or not reading:
            continue
        if want and surface not in want:
            continue
        entries[surface] = reading

    clean = normalize_entries(entries)
    if not clean:
        return {"ok": True, "curatedCount": 0, "promotedCount": 0, "pack": None}

    result = merge_curated_entries(clean, replace=False)
    if mark_promoted:
        for row in rows:
            if row.get("surface") in clean and row.get("status") == "accepted":
                row["promoted"] = True
                row["promotedAt"] = _utcnow()
        _rewrite_all_rows(rows)

    return {
        "ok": True,
        "promotedCount": len(clean),
        "curatedCount": result.get("curatedCount"),
        "pack": result.get("pack"),
    }
