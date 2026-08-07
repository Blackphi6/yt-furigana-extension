"""Developer paste → LLM extract → learning proposals / ingest log.

Admin-only. Paste googled / curated Japanese text; Groq pulls
surface→reading training rows for the lattice pipeline.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from reading_engine.contributions import DATA_DIR, validate_pair
from reading_engine.proposals import append_proposals

DEV_INGEST_FILE = DATA_DIR / "dev-ingest.jsonl"
_file_lock = Lock()

_MAX_TEXT = 20000
_MAX_ITEMS = 80


def _utcnow() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def ensure_dev_ingest_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DEV_INGEST_FILE.exists():
        DEV_INGEST_FILE.write_text("", encoding="utf-8")


def _groq_extract(
    text: str, *, focus: list[str], note: str
) -> list[dict[str, str]]:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise ValueError("groq_key_missing")

    model = os.environ.get(
        "YT_FURIGANA_DEV_INGEST_MODEL",
        os.environ.get("YT_FURIGANA_PROPOSAL_LLM_MODEL", "llama-3.1-8b-instant"),
    ).strip()
    focus_line = (
        "Prefer these surfaces when present: " + ", ".join(focus[:20])
        if focus
        else "Prefer heteronyms / ambiguous kanji useful for caption furigana."
    )
    note_line = f"Operator note: {note}\n" if note else ""
    prompt = (
        "You extract Japanese furigana training examples from pasted text.\n"
        "Return ONLY JSON: {\"items\":[{\"text\":\"short sentence\","
        "\"surface\":\"kanji word\",\"gold\":\"hiragana reading\","
        "\"note\":\"why this reading\"}]}\n"
        "Rules:\n"
        "- gold must be hiragana or katakana only (one reading per item)\n"
        "- surface must appear in text\n"
        "- text should be a short excerpt (≤80 chars) containing the surface\n"
        "- skip pure kana, punctuation-only, and jokes\n"
        "- max 60 items; dedupe by surface+gold+text\n"
        "If the paste has 【問題】 and 【解答】 (or 問題/解答) sections:\n"
        "- Match numbered lines (e.g. 55.) between question and answer\n"
        "- Answers like きんせい・きんぼし mean multiple readings for the SAME surface "
        "in that sentence — emit ONE item per reading, with a short excerpt that "
        "fits that sense (split the sentence at 、 if needed)\n"
        "- Prefer the kanji compound that differs in reading (金星, 町中, etc.)\n"
        f"{focus_line}\n"
        f"{note_line}"
        f"PASTE:\n{text[:_MAX_TEXT]}"
    )
    body = json.dumps(
        {
            "model": model,
            "temperature": 0.2,
            "max_tokens": 2200,
            "messages": [
                {
                    "role": "system",
                    "content": "Return compact JSON only. No markdown.",
                },
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
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        raise ValueError(f"groq_failed:{exc}") from exc

    try:
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("groq_bad_json") from exc

    raw_items = parsed.get("items") if isinstance(parsed, dict) else None
    if not isinstance(raw_items, list):
        raise ValueError("groq_no_items")

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        surf_raw = str(item.get("surface") or "").strip()
        gold_raw = str(item.get("gold") or item.get("reading") or "").strip()
        excerpt = str(item.get("text") or "").strip()[:120]
        item_note = str(item.get("note") or "").strip()[:120]
        try:
            surf, gold = validate_pair(surf_raw, gold_raw)
        except ValueError:
            continue
        if excerpt and surf not in excerpt:
            # keep if surface is in the full paste
            if surf not in text:
                continue
            excerpt = excerpt or surf
        elif not excerpt:
            # synthesize tiny context from paste
            idx = text.find(surf)
            if idx < 0:
                continue
            a = max(0, idx - 12)
            b = min(len(text), idx + len(surf) + 12)
            excerpt = text[a:b]
        key = f"{surf}\t{gold}"
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "text": excerpt,
                "surface": surf,
                "gold": gold,
                "reading": gold,
                "note": item_note,
            }
        )
        if len(out) >= _MAX_ITEMS:
            break
    return out


def extract_learning_items(
    text: str,
    *,
    focus_surfaces: list[str] | None = None,
    note: str = "",
) -> dict[str, Any]:
    raw = str(text or "").strip()
    if not raw:
        raise ValueError("text_required")
    if len(raw) > _MAX_TEXT:
        raise ValueError("text_too_long")
    focus = [
        str(s).strip()
        for s in (focus_surfaces or [])
        if str(s).strip()
    ][:20]
    items = _groq_extract(raw, focus=focus, note=str(note or "").strip()[:200])
    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "chars": len(raw),
    }


def commit_learning_items(
    items: list[dict[str, Any]],
    *,
    note: str = "",
    client_ip: str = "",
) -> dict[str, Any]:
    ensure_dev_ingest_store()
    cleaned: list[dict[str, str]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        try:
            surf, gold = validate_pair(
                str(item.get("surface") or ""),
                str(item.get("gold") or item.get("reading") or ""),
            )
        except ValueError:
            continue
        cleaned.append(
            {
                "text": str(item.get("text") or surf)[:120],
                "surface": surf,
                "gold": gold,
                "reading": gold,
                "note": str(item.get("note") or note or "")[:120],
            }
        )
    if not cleaned:
        raise ValueError("no_valid_items")

    ts = _utcnow()
    with _file_lock:
        with DEV_INGEST_FILE.open("a", encoding="utf-8") as fh:
            for row in cleaned:
                fh.write(
                    json.dumps(
                        {
                            "ts": ts,
                            "source": "dev-paste",
                            **row,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

    # Stage into proposal queue so LLM review / promote path can pick them up
    proposal_entries = [
        {"surface": r["surface"], "reading": r["reading"]} for r in cleaned
    ]
    try:
        prop = append_proposals(
            proposal_entries,
            client_ip=client_ip or "dev-ingest",
            source="dev-paste",
            note=(note or "dev-paste")[:80],
            use_llm=False,
            queue_llm=True,
            skip_cooldown=True,
        )
    except ValueError as exc:
        prop = {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "saved": len(cleaned),
        "ingestFile": str(DEV_INGEST_FILE.name),
        "proposals": prop,
        "items": cleaned,
    }


def ingest_stats() -> dict[str, Any]:
    ensure_dev_ingest_store()
    n = 0
    try:
        with DEV_INGEST_FILE.open(encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    n += 1
    except OSError:
        n = 0
    return {"devIngestLines": n, "path": str(DEV_INGEST_FILE.name)}
