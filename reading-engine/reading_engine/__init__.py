"""Local JRM-shaped reading engine.

Pipeline (hallucination-proof; matches Zenn JRM article order):
  1. user_dict (highest priority)
  2. trust regex patterns (idioms LLM judges get wrong)
  3. UniDic + heteronym lattice (candidates only; gold must be in set)
  4. ModernBERT pair rerank when available, else cue rules
  5. low confidence → dictionary/base fallback
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fugashi import Tagger

from reading_engine.reranker import confidence_threshold, get_reranker
from reading_engine.trust_patterns import match_trust_reading

REPO_ROOT = Path(__file__).resolve().parents[2]
CREATIVE_SEED = REPO_ROOT / "data" / "creative-ruby" / "seed.jsonl"
CREATIVE_HARVEST = REPO_ROOT / "data" / "creative-ruby" / "harvested.jsonl"
HETERONYM_JSON = REPO_ROOT / "data" / "generated" / "heteronym-candidates.json"

_KATA_TO_HIRA = str.maketrans({i: i - 0x60 for i in range(0x30A1, 0x30F7)})


def to_hiragana(text: str) -> str:
    return (text or "").translate(_KATA_TO_HIRA)


def normalize_reading(text: str) -> str:
    return to_hiragana(unicodedata.normalize("NFKC", text or ""))


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
    {"surface": "市場", "reading": "しじょう", "weight": 3, "cues": ["株式", "規模", "経済", "金融", "市場調査", "市場規模"]},
    {"surface": "市場", "reading": "いちば", "weight": 3, "cues": ["朝の", "鮮魚", "野菜", "市場で買", "朝市", "市場で魚"]},
    {"surface": "永遠", "reading": "えいえん", "weight": 4, "cues": ["永遠のテーマ", "永遠に終わ", "永遠に続く", "永遠の命", "永遠の課題", "永遠の"]},
    {"surface": "永遠", "reading": "とわ", "weight": 3, "cues": ["ただ永遠に", "永遠に愛", "永遠の愛", "永遠の眠り", "誓"]},
    {"surface": "下手", "reading": "したて", "weight": 5, "cues": ["下手に出", "下手に回"]},
    {"surface": "下手", "reading": "へた", "weight": 3, "cues": ["下手だ", "絵が下手", "字が下手"]},
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


def _pick_constrained(
    cands: list[str], scored: list[tuple[float, str, str]], base: str, threshold: float
) -> tuple[str, float, str]:
    """Argmax among candidates only; low confidence → base fallback."""
    if not scored:
        reading = base or (cands[0] if cands else "")
        return reading, 0.5, "base_engine"
    scored.sort(key=lambda x: (-x[0], x[1]))
    conf, reading, source = scored[0]
    # Structural guarantee: never leave the lattice
    if reading not in cands:
        reading = base if base in cands else cands[0]
        conf = 0.5
        source = "base_engine"
    if conf < threshold and base and base in cands:
        return base, round(max(conf, 0.5), 4), "base_engine"
    return reading, round(conf, 4), source


class ReadingEngine:
    def __init__(self) -> None:
        self.tagger = Tagger()
        self.creative = load_creative_entries()
        self.heteronyms = load_heteronym_map()
        self._creative_by_surface: dict[str, list[CreativeEntry]] = {}
        for entry in self.creative:
            self._creative_by_surface.setdefault(entry.surface, []).append(entry)
        self._threshold = confidence_threshold()

    def _base_reading(self, word) -> str:
        kana = getattr(word.feature, "kana", None) or getattr(word.feature, "pron", None) or ""
        if not kana or kana == "*":
            return ""
        return normalize_reading(kana.replace("ー", ""))

    def _candidates_for(self, surface: str, base: str, full_text: str) -> list[str]:
        """Build lattice. Base reading is always first when present. No free-form adds."""
        cands: list[str] = []
        seen: set[str] = set()

        def add(reading: str) -> None:
            r = normalize_reading(reading)
            if not r or r in seen:
                return
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
        trust = match_trust_reading(surface, full_text)
        if trust:
            add(trust.reading)
        if surface == "方" and "伝え方" in full_text:
            add("かた")
        return cands

    def _score_cue(
        self, surface: str, reading: str, full_text: str, base: str
    ) -> tuple[float, str]:
        best = 0.0
        source = "base_engine"
        if reading == base:
            best = 0.55
            source = "base_engine"

        for rule in CONTEXT_RULES:
            if rule["surface"] != surface or rule["reading"] != reading:
                continue
            hits = [c for c in rule["cues"] if c in full_text]
            if hits:
                longest = max(len(h) for h in hits)
                score = 0.7 + 0.05 * min(len(hits), 4) + 0.02 * rule.get("weight", 1)
                score += min(longest, 8) * 0.01
                if score > best:
                    best = min(score, 0.99)
                    source = "reranker"

        for entry in self._creative_by_surface.get(surface, []):
            if entry.reading != reading:
                continue
            hits = [c for c in entry.cues if c in full_text]
            if hits:
                score = 0.85 + 0.03 * min(len(hits), 3)
                if score > best:
                    best = min(score, 0.995)
                    source = "creative_ruby"
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

        return best, source

    def _select_reading(
        self, surface: str, base: str, cands: list[str], full_text: str
    ) -> tuple[str, float, str, list[str]]:
        # 2) Trust patterns (idioms)
        trust = match_trust_reading(surface, full_text)
        if trust and trust.reading in cands:
            return trust.reading, trust.confidence, "trust_pattern", cands[:6]

        # 4) ModernBERT among lattice only
        reranker = get_reranker()
        if reranker is not None and len(cands) >= 2:
            try:
                pairs = reranker.score_pairs(full_text, surface, cands)
                scored = [(score, cand, "reranker") for cand, score in pairs]
                reading, conf, source = _pick_constrained(
                    cands, scored, base, self._threshold
                )
                return reading, conf, source, cands[:6]
            except Exception as exc:  # noqa: BLE001
                print(f"[reading_engine] reranker score failed: {exc}")

        # Cue rules fallback (still lattice-only)
        scored = []
        for cand in cands:
            conf, source = self._score_cue(surface, cand, full_text, base)
            scored.append((conf, cand, source))
        reading, conf, source = _pick_constrained(
            cands, scored, base, self._threshold
        )
        return reading, conf, source, cands[:6]

    def analyze(self, text: str, user_dict: list[dict[str, str]] | None = None) -> dict[str, Any]:
        user_map = {
            e["surface"]: normalize_reading(e["reading"])
            for e in (user_dict or [])
            if e.get("surface") and e.get("reading")
        }
        words = list(self.tagger(text))
        tokens: list[dict[str, Any]] = []
        cursor = 0

        for word in words:
            surface = word.surface
            start = text.find(surface, cursor)
            if start < 0:
                start = cursor
            end = start + len(surface)
            cursor = end

            # 1) user_dict highest priority
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
                continue

            has_kanji = bool(re.search(r"[\u3400-\u9fff]", surface))
            if not has_kanji:
                continue

            base = self._base_reading(word)
            # 3) lattice
            cands = self._candidates_for(surface, base, text)
            if not cands:
                if base:
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
                continue

            reading, conf, source, out_cands = self._select_reading(
                surface, base, cands, text
            )
            # Final structural check
            if reading not in out_cands:
                reading = base if base in out_cands else out_cands[0]
                conf = 0.5
                source = "base_engine"

            tokens.append(
                {
                    "surface": surface,
                    "span": [start, end],
                    "reading": reading,
                    "confidence": conf,
                    "source": source,
                    "candidates": out_cands,
                }
            )

        # Creative multi-char surfaces (氷菓) — still lattice-local
        for entry in self.creative:
            idx = text.find(entry.surface)
            if idx < 0:
                continue
            hits = [c for c in entry.cues if c in text]
            if not hits and entry.genre not in ("lyric", "novel"):
                continue
            if not hits and not any(k in text for k in ("夏", "君", "恋", "風", "木陰", "口に")):
                if entry.surface != "氷菓":
                    continue
            end = idx + len(entry.surface)
            tokens = [t for t in tokens if not (t["span"][0] < end and t["span"][1] > idx)]
            creative_cands = [entry.reading]
            if "ひょうか" not in creative_cands:
                creative_cands.append("ひょうか")
            tokens.append(
                {
                    "surface": entry.surface,
                    "span": [idx, end],
                    "reading": entry.reading,
                    "confidence": 0.94 if hits else 0.8,
                    "source": "creative_ruby",
                    "candidates": creative_cands,
                }
            )
        tokens.sort(key=lambda t: t["span"][0])

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
