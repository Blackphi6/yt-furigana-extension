"""Developer paste → LLM extract → learning proposals / ingest log.

Admin-only. Paste googled / curated Japanese text; Groq pulls
surface→reading training rows for the lattice pipeline.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from reading_engine.contributions import DATA_DIR, READING_RE, validate_pair
from reading_engine.proposals import append_proposals

DEV_INGEST_FILE = DATA_DIR / "dev-ingest.jsonl"
_file_lock = Lock()

_MAX_TEXT = 20000
_MAX_ITEMS = 80

# 番号付き行: "21. …" / "21．…" / "21、…"
_NUM_LINE_RE = re.compile(
    r"^\s*(\d+)\s*[.．、]\s*(.+?)\s*$",
    re.MULTILINE,
)
# 漢字（必須）+ 送りがなっぽい末尾かな（広めに取り、後で短縮候補を展開）
_SURFACE_CAND_RE = re.compile(
    r"[\u3400-\u9fff\uF900-\uFAFF々〻]+[\u3040-\u309fー]*"
)
_SECTION_Q_RE = re.compile(
    r"(?:【\s*問題\s*】|^\s*問題\s*[:：]?\s*$)",
    re.MULTILINE | re.IGNORECASE,
)
_SECTION_A_RE = re.compile(
    r"(?:【\s*解答\s*】|^\s*解答\s*[:：]?\s*$)",
    re.MULTILINE | re.IGNORECASE,
)


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


def _parse_numbered_map(block: str) -> dict[int, str]:
    """番号→本文。同一番号が複数なら後勝ち（セクション内の重複用）。"""
    out: dict[int, str] = {}
    for m in _NUM_LINE_RE.finditer(block or ""):
        num = int(m.group(1))
        body = m.group(2).strip()
        if body:
            out[num] = body
    return out


def _parse_numbered_entries(block: str) -> list[tuple[int, str]]:
    """番号付き行を出現順のまま返す（同一番号の問題行+解答行に対応）。"""
    out: list[tuple[int, str]] = []
    for m in _NUM_LINE_RE.finditer(block or ""):
        body = m.group(2).strip()
        if body:
            out.append((int(m.group(1)), body))
    return out


def _split_quiz_sections(text: str) -> tuple[str, str] | None:
    """問題/解答ブロックに分ける。見つからなければ None。"""
    raw = str(text or "")
    q_marks = list(_SECTION_Q_RE.finditer(raw))
    a_marks = list(_SECTION_A_RE.finditer(raw))
    if not q_marks or not a_marks:
        return None
    q0 = q_marks[0]
    a0 = a_marks[0]
    if a0.start() > q0.start():
        q_body = raw[q0.end() : a0.start()]
        a_body = raw[a0.end() :]
    else:
        a_body = raw[a0.end() : q0.start()]
        q_body = raw[q0.end() :]
    return q_body, a_body


def _split_readings(answer: str) -> list[str]:
    parts = re.split(r"[・･·/／|｜]+", str(answer or ""))
    out: list[str] = []
    for p in parts:
        gold = p.strip()
        if not gold:
            continue
        if not READING_RE.match(gold):
            continue
        out.append(gold)
    return out


def _split_clauses(question: str) -> list[str]:
    # 読点・句点で区切り、各節に表層を割り当てる
    parts = re.split(r"[、。！？!\?]+", str(question or ""))
    return [p.strip() for p in parts if p.strip()]


def _surface_candidates(clause: str) -> list[str]:
    """表層候補。『入れると』から『入れる』『入』なども展開する。"""
    # 助詞っぽい末尾は表層に含めない
    particle_tail = re.compile(r"[のにとをはがともでへやへ]+$")
    found: set[str] = set()
    for raw0 in _SURFACE_CAND_RE.findall(clause or ""):
        raw = particle_tail.sub("", raw0)
        if not raw or not any(
            "\u3400" <= c <= "\u9fff" or "\uF900" <= c <= "\uFAFF" or c in "々〻"
            for c in raw
        ):
            continue
        m = re.match(
            r"^([\u3400-\u9fff\uF900-\uFAFF々〻]+)([\u3040-\u309fー]*)$",
            raw,
        )
        if not m:
            found.add(raw)
            continue
        core, okuri = m.group(1), m.group(2)
        # 送りがなに助詞が混ざっていたらそこで切る
        okuri = re.split(r"[のにとをはがともでへや]", okuri, maxsplit=1)[0]
        found.add(core)
        for i in range(len(okuri) + 1):
            found.add(core + okuri[:i])
    # 漢字が多く、同じなら長い表層を優先（入れる > 入、内輪 > 話）
    def score(s: str) -> tuple[int, int]:
        kanji = sum(
            1
            for c in s
            if "\u3400" <= c <= "\u9fff"
            or "\uF900" <= c <= "\uFAFF"
            or c in "々〻"
        )
        return (kanji, len(s))

    return sorted(found, key=score, reverse=True)


def _pick_shared_surface(clauses: list[str]) -> str | None:
    if not clauses:
        return None
    cand_sets = [set(_surface_candidates(c)) for c in clauses]
    shared = set.intersection(*cand_sets) if cand_sets else set()
    pool = shared if shared else set(_surface_candidates(clauses[0]))
    if not pool:
        return None

    def score(s: str) -> tuple[int, int]:
        kanji = sum(
            1
            for c in s
            if "\u3400" <= c <= "\u9fff"
            or "\uF900" <= c <= "\uFAFF"
            or c in "々〻"
        )
        return (kanji, len(s))

    return sorted(pool, key=score, reverse=True)[0]


def _pair_quiz_item(
    surface: str, gold: str, excerpt: str, *, note: str = ""
) -> dict[str, str] | None:
    try:
        surf, reading = validate_pair(surface, gold)
    except ValueError:
        return None
    text = (excerpt or surf).strip()[:120]
    if surf not in text:
        text = surf
    return {
        "text": text,
        "surface": surf,
        "gold": reading,
        "reading": reading,
        "note": (note or "quiz-parse")[:120],
    }


def parse_quiz_paste(text: str) -> list[dict[str, str]]:
    """【問題】/【解答】の番号対応を決定的に表層→読みへ。

    例: 21. 水を入れると、ここには入れる。 / 21. いれる・はいれる
    → 入れる=いれる（水を入れると）と 入れる=はいれる（ここには入れる）の2件。
    """
    raw = str(text or "").strip()
    if not raw:
        return []

    sections = _split_quiz_sections(raw)
    if sections:
        q_map = _parse_numbered_map(sections[0])
        a_map = _parse_numbered_map(sections[1])
    else:
        # セクション無し: かなのみの番号行を解答、漢字を含む番号行を問題とみなす
        # （同一番号が2行あっても dict 上書きせず両方取る）
        q_map = {}
        a_map = {}
        for num, body in _parse_numbered_entries(raw):
            readings = _split_readings(body)
            has_kanji = bool(_SURFACE_CAND_RE.search(body))
            if readings and not has_kanji:
                a_map[num] = body
            elif has_kanji:
                q_map[num] = body

    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for num in sorted(set(q_map) & set(a_map)):
        question = q_map[num]
        readings = _split_readings(a_map[num])
        if not readings:
            continue
        clauses = _split_clauses(question)
        surface = _pick_shared_surface(clauses if clauses else [question])
        if not surface:
            continue

        if len(readings) > 1 and len(clauses) >= len(readings):
            # 読点区切りの節に読みを1:1対応（いれる・はいれる の本線）
            for gold, clause in zip(readings, clauses):
                if surface not in clause:
                    # この節に表層が無いなら質問全文を使う
                    clause = question
                row = _pair_quiz_item(
                    surface,
                    gold,
                    clause,
                    note=f"quiz#{num}",
                )
                if not row:
                    continue
                key = f"{row['surface']}\t{row['gold']}\t{row['text']}"
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
                if len(out) >= _MAX_ITEMS:
                    return out
        else:
            # 読み1つ、または節が足りない → 全文を共有し読みごとに1件
            for gold in readings:
                row = _pair_quiz_item(
                    surface,
                    gold,
                    question,
                    note=f"quiz#{num}",
                )
                if not row:
                    continue
                key = f"{row['surface']}\t{row['gold']}\t{row['text']}"
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
                if len(out) >= _MAX_ITEMS:
                    return out
    return out


def _merge_extract_items(
    primary: list[dict[str, str]], secondary: list[dict[str, str]]
) -> list[dict[str, str]]:
    """primary 優先。surface+gold が同じなら primary の抜粋を残す。"""
    out: list[dict[str, str]] = []
    seen_sg: set[str] = set()
    for row in primary + secondary:
        sg = f"{row.get('surface')}\t{row.get('gold') or row.get('reading')}"
        if sg in seen_sg:
            continue
        seen_sg.add(sg)
        out.append(row)
        if len(out) >= _MAX_ITEMS:
            break
    return out


def _normalize_groq_key(raw: str) -> str:
    """貼り付けミス（引用符・Bearer 接頭・空白）を除去する。"""
    key = str(raw or "").strip().strip('"').strip("'")
    if key.lower().startswith("bearer "):
        key = key[7:].strip()
    return key


def _groq_http_error_detail(exc: BaseException) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8", errors="replace")[:400]
        except Exception:
            body = ""
        if body:
            return f"HTTP {exc.code}: {body}"
        return f"HTTP Error {exc.code}: {exc.reason}"
    return str(exc)


def _groq_extract(
    text: str, *, focus: list[str], note: str
) -> list[dict[str, str]]:
    api_key = _normalize_groq_key(os.environ.get("GROQ_API_KEY", ""))
    if not api_key:
        raise ValueError("groq_key_missing")
    if "..." in api_key or not api_key.startswith("gsk_"):
        raise ValueError(
            "groq_key_invalid: gsk_ で始まる全文を Render の GROQ_API_KEY に設定"
            "（マスク表示 gsk_…xxx は不可。作成直後にコピー）"
        )

    primary = os.environ.get(
        "YT_FURIGANA_DEV_INGEST_MODEL",
        os.environ.get("YT_FURIGANA_PROPOSAL_LLM_MODEL", "llama-3.1-8b-instant"),
    ).strip()
    # 403（モデル権限・リージョン）時に順に試す
    models = [primary]
    for alt in ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b"):
        if alt and alt not in models:
            models.append(alt)

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

    last_err = ""
    payload: dict[str, Any] | None = None
    for model in models:
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
            break
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_err = _groq_http_error_detail(exc)
            # 401 はキー自体が無効 → モデル切替しても無駄
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 400):
                raise ValueError(f"groq_failed:{last_err}") from exc
            continue
    if payload is None:
        raise ValueError(f"groq_failed:{last_err or 'unknown'}")

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
    quiz_only: bool = False,
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
    # 問題/解答の番号対応は LLM より先に決定的パース（いれる・はいれる漏れ防止）
    quiz_items = parse_quiz_paste(raw)
    if quiz_only:
        items = quiz_items
        via = "quiz"
    else:
        llm_items: list[dict[str, str]] = []
        llm_err = ""
        try:
            llm_items = _groq_extract(
                raw, focus=focus, note=str(note or "").strip()[:200]
            )
        except ValueError as exc:
            llm_err = str(exc)
            if not quiz_items:
                raise
        items = _merge_extract_items(quiz_items, llm_items)
        via = "quiz+llm" if quiz_items and llm_items else ("quiz" if quiz_items else "llm")
        if llm_err and quiz_items:
            via = f"quiz(llm_skipped:{llm_err[:40]})"
    return {
        "ok": True,
        "count": len(items),
        "items": items,
        "chars": len(raw),
        "quizCount": len(quiz_items),
        "via": via,
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
