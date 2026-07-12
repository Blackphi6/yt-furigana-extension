"""Local JRM-shaped reading engine: lattice + cue rerank + creative ruby."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fugashi import Tagger

REPO_ROOT = Path(__file__).resolve().parents[2]
CREATIVE_SEED = REPO_ROOT / "data" / "creative-ruby" / "seed.jsonl"
CREATIVE_HARVEST = REPO_ROOT / "data" / "creative-ruby" / "harvested.jsonl"
HETERONYM_JSON = REPO_ROOT / "data" / "generated" / "heteronym-candidates.json"

_KATA_TO_HIRA = str.maketrans(
    {i: i - 0x60 for i in range(0x30A1, 0x30F7)}
)


def to_hiragana(text: str) -> str:
    return (text or "").translate(_KATA_TO_HIRA)


def normalize_reading(text: str) -> str:
    return to_hiragana(unicodedata.normalize("NFKC", text or ""))


# Port of high-value cues from src/reading-context.js (+ extras)
CONTEXT_RULES: list[dict[str, Any]] = [
    {"surface": "忙しい", "reading": "せわしい", "weight": 3, "cues": ["暇もない", "世界", "恋", "心", "胸", "街", "夜", "夢", "涙", "君", "僕"]},
    {"surface": "忙しい", "reading": "いそがしい", "weight": 1, "cues": ["仕事", "予定", "会議", "残業"]},
    {"surface": "辛い", "reading": "からい", "weight": 3, "cues": ["ラーメン", "カレー", "味", "食べ", "料理", "唐辛子"]},
    {"surface": "辛い", "reading": "つらい", "weight": 3, "cues": ["経験", "出来事", "思い", "過去", "気持ち", "人生"]},
    {"surface": "空", "reading": "くう", "weight": 3, "cues": ["空を切", "空中", "空間", "空港", "空気", "真空", "空席"]},
    {"surface": "空", "reading": "そら", "weight": 2, "cues": ["青空", "夜空", "雲", "星", "晴れた空"]},
    {"surface": "空", "reading": "から", "weight": 2, "cues": ["空手", "空振り", "空っぽ", "空にする"]},
    {"surface": "表", "reading": "おもて", "weight": 2, "cues": ["裏", "畳", "顔", "出る", "立つ", "玄関"]},
    {"surface": "表", "reading": "ひょう", "weight": 2, "cues": ["グラフ", "データ", "一覧", "表を見", "成績"]},
    {"surface": "方", "reading": "かた", "weight": 3, "cues": ["伝え方", "やり方", "読み方", "考え方", "仕方", "見方", "聞き方", "愛し方"]},
    {"surface": "方", "reading": "ほう", "weight": 2, "cues": ["の方", "方向", "一方", "両方", "方へ"]},
    {"surface": "大事", "reading": "おおごと", "weight": 3, "cues": ["誤解", "なる", "騒ぎ", "事件", "問題に"]},
    {"surface": "大事", "reading": "だいじ", "weight": 2, "cues": ["大切", "大事な人", "大事に", "とても大事"]},
    {"surface": "市場", "reading": "しじょう", "weight": 3, "cues": ["株式", "規模", "経済", "金融", "市場調査"]},
    {"surface": "市場", "reading": "いちば", "weight": 3, "cues": ["朝の", "鮮魚", "野菜", "市場で買", "朝市"]},
    {"surface": "今日", "reading": "きょう", "weight": 2, "cues": ["明日", "昨日", "今日は", "今日も"]},
    {"surface": "今日", "reading": "こんにち", "weight": 3, "cues": ["今日この頃", "今日では", "今日において"]},
    {"surface": "風", "reading": "かぜ", "weight": 2, "cues": ["吹", "強風", "風が"]},
    {"surface": "風", "reading": "ふう", "weight": 2, "cues": ["こんなふう", "どういうふう", "ふうに"]},
    {"surface": "博士", "reading": "はかせ", "weight": 2, "cues": ["物知り", "博士だ"]},
    {"surface": "博士", "reading": "はくし", "weight": 3, "cues": ["博士号", "学位", "論文"]},
]


@dataclass
class CreativeEntry:
    surface: str
    reading: str
    genre: str = "lyric"
    cues: list[str] = field(default_factory=list)
    note: str = ""


def _load_creative_file(path: Path, out: list[CreativeEntry]) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        out.append(
            CreativeEntry(
                surface=row["surface"],
                reading=normalize_reading(row["reading"]),
                genre=row.get("genre", "lyric"),
                cues=list(row.get("cues") or []),
                note=row.get("note") or "",
            )
        )


def load_creative_entries(
    seed: Path = CREATIVE_SEED, harvest: Path = CREATIVE_HARVEST
) -> list[CreativeEntry]:
    out: list[CreativeEntry] = []
    _load_creative_file(seed, out)
    _load_creative_file(harvest, out)
    return out


def load_heteronym_map(path: Path = HETERONYM_JSON) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        k: [normalize_reading(r) for r in v]
        for k, v in data.items()
        if isinstance(v, list)
    }


class ReadingEngine:
    def __init__(self) -> None:
        self.tagger = Tagger()
        self.creative = load_creative_entries()
        self.heteronyms = load_heteronym_map()
        self._creative_by_surface: dict[str, list[CreativeEntry]] = {}
        for entry in self.creative:
            self._creative_by_surface.setdefault(entry.surface, []).append(entry)

    def _base_reading(self, word) -> str:
        kana = getattr(word.feature, "kana", None) or getattr(word.feature, "pron", None) or ""
        if not kana or kana == "*":
            return ""
        return normalize_reading(kana.replace("ー", ""))

    def _candidates_for(self, surface: str, base: str, full_text: str) -> list[str]:
        cands: list[str] = []
        seen: set[str] = set()

        def add(reading: str) -> None:
            r = normalize_reading(reading)
            if not r or r in seen:
                return
            # Drop fragment junk from heteronym dumps (夏→か/げ, 口→く).
            if base and len(r) == 1 and len(base) >= 2:
                return
            seen.add(r)
            cands.append(r)

        if base:
            add(base)
        for r in self.heteronyms.get(surface, []):
            add(r)
        for rule in CONTEXT_RULES:
            if rule["surface"] == surface:
                add(rule["reading"])
        for entry in self._creative_by_surface.get(surface, []):
            add(entry.reading)
        # compound: 伝え方
        if surface == "方" and "伝え方" in full_text:
            add("かた")
        return cands

    def _score_reading(
        self, surface: str, reading: str, full_text: str, base: str
    ) -> tuple[float, str, list[str]]:
        """Return confidence, source, candidate list helpers."""
        # user handled outside
        best = 0.0
        source = "base_engine"
        matched_cues: list[str] = []

        if reading == base:
            best = 0.55
            source = "base_engine"

        for rule in CONTEXT_RULES:
            if rule["surface"] != surface or rule["reading"] != reading:
                continue
            hits = [c for c in rule["cues"] if c in full_text]
            if hits:
                score = 0.7 + 0.05 * min(len(hits), 4) + 0.02 * rule.get("weight", 1)
                if score > best:
                    best = min(score, 0.99)
                    source = "reranker"
                    matched_cues = hits

        for entry in self._creative_by_surface.get(surface, []):
            if entry.reading != reading:
                continue
            hits = [c for c in entry.cues if c in full_text]
            # Creative: need cue hit OR explicit genre preference when cues empty and lyric-ish
            if hits:
                score = 0.85 + 0.03 * min(len(hits), 3)
                if score > best:
                    best = min(score, 0.995)
                    source = "creative_ruby"
                    matched_cues = hits
            elif entry.genre in ("lyric", "novel") and any(
                k in full_text for k in ("夏", "君", "恋", "夢", "夜", "風", "歌")
            ):
                score = 0.72
                if score > best:
                    best = score
                    source = "creative_ruby"

        if surface == "方" and reading == "かた" and re.search(r".+方", full_text):
            if any(p in full_text for p in ("伝え方", "やり方", "考え方", "愛し方")):
                if 0.9 > best:
                    best = 0.92
                    source = "reranker"

        return best, source, matched_cues

    def analyze(self, text: str, user_dict: list[dict[str, str]] | None = None) -> dict[str, Any]:
        user_map = {
            e["surface"]: normalize_reading(e["reading"])
            for e in (user_dict or [])
            if e.get("surface") and e.get("reading")
        }
        words = list(self.tagger(text))
        tokens: list[dict[str, Any]] = []
        reading_parts: list[str] = []
        cursor = 0

        # Align surfaces to original text indices for spans
        for word in words:
            surface = word.surface
            start = text.find(surface, cursor)
            if start < 0:
                start = cursor
            end = start + len(surface)
            cursor = end

            if surface in user_map:
                reading = user_map[surface]
                tokens.append(
                    {
                        "surface": surface,
                        "span": [start, end],
                        "reading": reading,
                        "confidence": 1.0,
                        "source": "user_dict",
                        "candidates": [reading],
                    }
                )
                reading_parts.append(reading)
                continue

            # Prefer creative/compound phrase hits longer than token
            phrase_hit = None
            for entry in self.creative:
                if entry.surface in text[max(0, start - 2) : end + 4] and entry.surface.startswith(
                    surface
                ):
                    # handled at phrase level below
                    pass

            base = self._base_reading(word)
            has_kanji = bool(re.search(r"[\u3400-\u9fff]", surface))
            if not has_kanji:
                reading_parts.append(normalize_reading(surface) if re.search(r"[ァ-ヶ]", surface) else surface)
                continue

            cands = self._candidates_for(surface, base, text)
            if not cands:
                if base:
                    reading_parts.append(base)
                    tokens.append(
                        {
                            "surface": surface,
                            "span": [start, end],
                            "reading": base,
                            "confidence": 0.5,
                            "source": "base_engine",
                            "candidates": [base],
                        }
                    )
                else:
                    reading_parts.append(surface)
                continue

            scored = []
            for cand in cands:
                conf, source, _ = self._score_reading(surface, cand, text, base)
                scored.append((conf, cand, source))
            scored.sort(key=lambda x: (-x[0], x[1]))
            conf, reading, source = scored[0]
            # If creative surface exact match with cues, override whole phrase
            for entry in self._creative_by_surface.get(surface, []):
                if entry.cues and any(c in text for c in entry.cues):
                    reading = entry.reading
                    conf = max(conf, 0.9)
                    source = "creative_ruby"
                    if entry.reading not in cands:
                        cands = [entry.reading] + cands

            tokens.append(
                {
                    "surface": surface,
                    "span": [start, end],
                    "reading": reading,
                    "confidence": round(conf, 4),
                    "source": source,
                    "candidates": cands[:6],
                }
            )
            reading_parts.append(reading)

        # Second pass: multi-char creative surfaces (氷菓)
        for entry in self.creative:
            idx = text.find(entry.surface)
            if idx < 0:
                continue
            hits = [c for c in entry.cues if c in text]
            if not hits and entry.genre not in ("lyric", "novel"):
                continue
            if not hits and not any(k in text for k in ("夏", "君", "恋", "風", "木陰", "口に")):
                # still allow exact known seed with weak prior for demo sentences
                if entry.surface != "氷菓":
                    continue
            # Replace overlapping tokens
            end = idx + len(entry.surface)
            tokens = [t for t in tokens if not (t["span"][0] < end and t["span"][1] > idx)]
            tokens.append(
                {
                    "surface": entry.surface,
                    "span": [idx, end],
                    "reading": entry.reading,
                    "confidence": 0.94 if hits else 0.8,
                    "source": "creative_ruby",
                    "candidates": [entry.reading, "ひょうか"],
                }
            )
        tokens.sort(key=lambda t: t["span"][0])

        # Rebuild full reading string coarsely
        full_reading = "".join(
            t["reading"] if t.get("reading") else text[t["span"][0] : t["span"][1]]
            for t in tokens
        )
        # Fill gaps with raw kana/punct from text
        rebuilt = []
        pos = 0
        for t in tokens:
            if t["span"][0] > pos:
                rebuilt.append(text[pos : t["span"][0]])
            rebuilt.append(t["reading"])
            pos = t["span"][1]
        if pos < len(text):
            rebuilt.append(text[pos:])
        full_reading = normalize_reading("".join(rebuilt))

        return {"reading": full_reading, "tokens": tokens}


_engine: ReadingEngine | None = None


def get_engine() -> ReadingEngine:
    global _engine
    if _engine is None:
        _engine = ReadingEngine()
    return _engine
