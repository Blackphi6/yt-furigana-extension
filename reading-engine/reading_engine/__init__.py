"""Local candidate-constrained reading engine.

Pipeline (hallucination-proof; see docs/READING-PIPELINE.md):
  1. user_dict (highest priority)
  2. trust regex patterns (idioms LLM judges get wrong)
  3. UniDic + heteronym lattice (candidates only; gold must be in set)
  4. ModernBERT pair rerank when available, else cue rules
  5. low confidence → dictionary/base fallback
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fugashi import Tagger

from reading_engine.reranker import confidence_threshold, get_reranker
from reading_engine.trust_patterns import match_trust_reading
from reading_engine.annotation_markers import strip_annotation_markers
from reading_engine.personal_names import (
    collect_phrase_spans,
    load_personal_name_phrases,
)
from reading_engine.number_readings import merge_number_tokens

REPO_ROOT = Path(__file__).resolve().parents[2]
CREATIVE_SEED = REPO_ROOT / "data" / "creative-ruby" / "seed.jsonl"
CREATIVE_HARVEST = REPO_ROOT / "data" / "creative-ruby" / "harvested.jsonl"
HETERONYM_JSON = REPO_ROOT / "data" / "generated" / "heteronym-candidates.json"

_KATA_TO_HIRA = str.maketrans({i: i - 0x60 for i in range(0x30A1, 0x30F7)})


def to_hiragana(text: str) -> str:
    return (text or "").translate(_KATA_TO_HIRA)


def normalize_reading(text: str) -> str:
    return to_hiragana(unicodedata.normalize("NFKC", text or ""))


_CLAUSE_SEPS = frozenset("。！？\n、")


def clause_context(text: str, span: tuple[int, int] | None) -> str:
    """Limit cue matching to the clause around this token (、。 etc.).

    Dual-reading demos put opposite senses in different clauses; whole-text
    cues otherwise bleed across both occurrences.
    """
    if not text:
        return ""
    if not span:
        return text
    start, end = span
    start = max(0, min(start, len(text)))
    end = max(start, min(end, len(text)))
    left = 0
    for i in range(start - 1, -1, -1):
        if text[i] in _CLAUSE_SEPS:
            left = i + 1
            break
    right = len(text)
    for i in range(end, len(text)):
        if text[i] in _CLAUSE_SEPS:
            right = i
            break
    return text[left:right]


def _cue_rule_score(rule: dict[str, Any], local: str) -> float:
    hits = [c for c in rule.get("cues") or [] if c in local]
    if not hits:
        return 0.0
    longest = max(len(h) for h in hits)
    score = 0.7 + 0.05 * min(len(hits), 4) + 0.02 * rule.get("weight", 1)
    score += min(longest, 8) * 0.01
    return min(score, 0.99)


def collect_context_rule_spans(
    text: str,
) -> list[tuple[int, int, str, str, float, list[str]]]:
    """
    形態素が「一日」→「一」「日」に割っても、CONTEXT_RULES の複合表層を
    文節ローカルなキューで拾う（同一文の二重出現デモ用）。
    """
    if not text:
        return []
    surfaces = sorted(
        {str(r["surface"]) for r in CONTEXT_RULES if len(str(r.get("surface") or "")) >= 2},
        key=len,
        reverse=True,
    )
    if not surfaces:
        return []

    occupied = [False] * len(text)
    spans: list[tuple[int, int, str, str, float, list[str]]] = []
    i = 0
    while i < len(text):
        if occupied[i]:
            i += 1
            continue
        hit: tuple[int, int, str, str, float, list[str]] | None = None
        for surface in surfaces:
            end = i + len(surface)
            if end > len(text) or text[i:end] != surface:
                continue
            if any(occupied[j] for j in range(i, end)):
                continue
            local = clause_context(text, (i, end))
            best_reading = ""
            best_score = 0.0
            cands: list[str] = []
            for rule in CONTEXT_RULES:
                if rule.get("surface") != surface:
                    continue
                reading = normalize_reading(str(rule.get("reading") or ""))
                if reading and reading not in cands:
                    cands.append(reading)
                score = _cue_rule_score(rule, local)
                if score > best_score:
                    best_score = score
                    best_reading = reading
            if best_reading and best_score >= 0.7:
                hit = (i, end, surface, best_reading, best_score, cands or [best_reading])
                break
        if hit:
            start, end, surface, reading, score, cands = hit
            for j in range(start, end):
                occupied[j] = True
            spans.append(hit)
            i = end
        else:
            i += 1
    return spans


CONTEXT_RULES: list[dict[str, Any]] = [
    {"surface": "忙しい", "reading": "せわしい", "weight": 3, "cues": ["暇もない", "世界", "恋", "心", "胸", "街", "夜", "夢", "涙", "君", "僕"]},
    {"surface": "忙しい", "reading": "いそがしい", "weight": 3, "cues": ["仕事", "予定", "会議", "残業"]},
    {"surface": "辛い", "reading": "からい", "weight": 3, "cues": ["ラーメン", "カレー", "味", "食べ", "料理", "唐辛子"]},
    {"surface": "辛い", "reading": "つらい", "weight": 3, "cues": ["経験", "出来事", "思い", "過去", "気持ち", "人生"]},
    {"surface": "空", "reading": "くう", "weight": 3, "cues": ["空を切", "空中", "空間", "空港", "空気", "真空", "空席"]},
    {"surface": "空", "reading": "そら", "weight": 2, "cues": ["青空", "夜空", "雲", "星", "晴れた空"]},
    {"surface": "空", "reading": "から", "weight": 2, "cues": ["空手", "空振り", "空っぽ", "空にする"]},
    {"surface": "表", "reading": "おもて", "weight": 3, "cues": ["裏", "畳", "顔", "出る", "出て", "表に出", "立つ", "玄関"]},
    {"surface": "表", "reading": "ひょう", "weight": 3, "cues": ["グラフ", "データ", "一覧", "表を見", "表にまとめ", "成績"]},
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
    {"surface": "風", "reading": "かぜ", "weight": 3, "cues": ["吹", "強風", "風が", "風で", "風強"]},
    {"surface": "風", "reading": "ふう", "weight": 3, "cues": ["こんな風", "どういう風", "風に書", "風にやっ", "ああいう風"]},
    {"surface": "博士", "reading": "はかせ", "weight": 3, "cues": ["物知り", "博士だ", "物知り博士"]},
    {"surface": "博士", "reading": "はくし", "weight": 3, "cues": ["博士号", "博士の学位", "学位", "論文"]},
    # 同表層の二重出現デモ用
    {"surface": "町中", "reading": "まちなか", "weight": 4, "cues": ["町中の", "町中のカフェ", "市街"]},
    {"surface": "町中", "reading": "まちじゅう", "weight": 4, "cues": ["町中に広", "噂が町中", "町中に知れ", "町中で噂"]},
    {"surface": "人気", "reading": "ひとけ", "weight": 5, "cues": ["人気のない", "人気がない", "人気のない夜", "人気のない道"]},
    {"surface": "人気", "reading": "にんき", "weight": 4, "cues": ["人気が高", "人気者", "人気曲", "大人気"]},
    {"surface": "一行", "reading": "いちぎょう", "weight": 5, "cues": ["一行だけ", "一行書", "一行メモ", "一行残"]},
    {"surface": "一行", "reading": "いっこう", "weight": 5, "cues": ["観光客の一行", "一行が到", "一行が到着", "一行の旅"]},
    {"surface": "一日", "reading": "ついたち", "weight": 5, "cues": ["毎月一日", "一日に給料", "月の一日", "一日付", "一日には", "結局一日"]},
    {"surface": "一日", "reading": "いちにち", "weight": 5, "cues": ["丸一日", "一日かか", "一日で読", "一日中", "一日中粘"]},
    {"surface": "上手", "reading": "じょうず", "weight": 5, "cues": ["が上手", "歌が上手", "絵が上手", "上手だ"]},
    {"surface": "上手", "reading": "うわて", "weight": 5, "cues": ["上手に回", "上手に出", "交渉では上手"]},
    # JKYB-Parakeet 誤答補正（拡張 reading-context.js と同期）
    {"surface": "公", "reading": "おおやけ", "weight": 5, "cues": ["公の場", "公の機関", "公にする", "公には"]},
    {"surface": "香", "reading": "か", "weight": 5, "cues": ["梅の香", "花の香", "の香が", "の香を", "残香"]},
    {"surface": "紅", "reading": "べに", "weight": 5, "cues": ["紅を引", "紅をさ", "紅を差", "紅筆", "口紅"]},
    {"surface": "候", "reading": "そうろう", "weight": 5, "cues": ["申し上げ候", "ござ候", "候。", "候ふ", "候へ"]},
    {"surface": "呉", "reading": "ご", "weight": 5, "cues": ["呉の時代", "呉の国", "中国の呉", "呉越", "三国"]},
    {"surface": "込", "reading": "こ", "weight": 5, "cues": ["道が込む", "が込む", "込むから"]},
    {"surface": "込む", "reading": "こむ", "weight": 5, "cues": ["道が込む", "が込む", "込むから"]},
    {"surface": "際", "reading": "きわ", "weight": 5, "cues": ["崖の際", "窓の際", "水際", "の際で", "の際に立"]},
    {"surface": "札", "reading": "ふだ", "weight": 5, "cues": ["示す札", "小さな札", "札を吊る", "札を受け取", "お札", "絵馬"]},
    {"surface": "氏", "reading": "うじ", "weight": 5, "cues": ["氏より育ち", "氏が社会", "氏族", "氏姓", "古代日本では、氏"]},
    {"surface": "社", "reading": "やしろ", "weight": 5, "cues": ["この社は", "小さな社", "社に集ま", "村人がみんな社", "雪化粧した小さな社"]},
    {"surface": "字", "reading": "じ", "weight": 5, "cues": ["彼の字", "字はとても", "字が上手", "字がきれい", "読みやすい"]},
    {"surface": "痕", "reading": "あと", "weight": 5, "cues": ["足痕", "傷痕", "血痕", "痕が残"]},
    {"surface": "根", "reading": "こん", "weight": 5, "cues": ["平方根", "立方根", "累乗根"]},
]

# 複合語の強制読み（拡張 MANUAL_PHRASE_READINGS と同期）
MANUAL_PHRASES: dict[str, str] = {
    "故郷": "こきょう",
    "太后": "たいこう",
    "紅色": "べにいろ",
    "命綱": "いのちつな",
    "筋骨": "きんこつ",
    "平方根": "へいほうこん",
    "今帝": "きんてい",
    "撮了": "さつりょう",
    "揚子江": "ようすこう",
    "足痕": "あしあと",
    "骨董市": "こっとういち",
    "滋雨": "じう",
    "黄金千貫": "こがねせんがん",
    "七五三": "しちごさん",
    "七福神": "しちふくじん",
    "七日": "なのか",
    "四つ": "よっつ",
    "四時": "よじ",
    "氷室": "ひむろ",
    "字は": "じは",
}


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
        self,
        surface: str,
        reading: str,
        full_text: str,
        base: str,
        span: tuple[int, int] | None = None,
    ) -> tuple[float, str]:
        best = 0.0
        source = "base_engine"
        if reading == base:
            best = 0.55
            source = "base_engine"

        local = clause_context(full_text, span)

        for rule in CONTEXT_RULES:
            if rule["surface"] != surface or rule["reading"] != reading:
                continue
            hits = [c for c in rule["cues"] if c in local]
            if hits:
                longest = max(len(h) for h in hits)
                score = 0.7 + 0.05 * min(len(hits), 4) + 0.02 * rule.get("weight", 1)
                score += min(longest, 8) * 0.01
                if score > best:
                    best = min(score, 0.99)
                    source = "cue"

        for entry in self._creative_by_surface.get(surface, []):
            if entry.reading != reading:
                continue
            hits = [c for c in entry.cues if c in local]
            if hits:
                score = 0.85 + 0.03 * min(len(hits), 3)
                if score > best:
                    best = min(score, 0.995)
                    source = "creative_ruby"
            elif entry.genre in ("lyric", "novel") and any(
                k in local for k in ("夏", "君", "恋", "夢", "夜", "歌")
            ):
                # Do not use bare 「風」 as a creative boost — conflicts with かぜ/ふう demos.
                score = 0.72
                if score > best:
                    best = score
                    source = "creative_ruby"

        if surface == "方" and reading == "かた" and re.search(r".+方", local):
            if any(p in local for p in ("伝え方", "やり方", "考え方", "愛し方")):
                if 0.9 > best:
                    best = 0.92
                    source = "cue"

        return best, source

    def _select_reading(
        self,
        surface: str,
        base: str,
        cands: list[str],
        full_text: str,
        span: tuple[int, int] | None = None,
    ) -> tuple[str, float, str, list[str]]:
        # 2) Trust patterns (idioms) — scoped to this token's neighborhood
        trust = match_trust_reading(surface, full_text, span)
        if trust and trust.reading in cands:
            return trust.reading, trust.confidence, "trust_pattern", cands[:6]

        # 3) 高確信キュー（手作りルール）— reranker より優先
        cue_scored = []
        for cand in cands:
            conf, source = self._score_cue(surface, cand, full_text, base, span)
            cue_scored.append((conf, cand, source))
        cue_reading, cue_conf, cue_src = _pick_constrained(
            cands, cue_scored, base, 0.85
        )
        if cue_src in ("cue", "creative_ruby") and cue_conf >= 0.85:
            return cue_reading, cue_conf, cue_src, cands[:6]

        # 4) ModernBERT among lattice only
        reranker = get_reranker()
        if reranker is not None and len(cands) >= 2:
            try:
                pairs = reranker.score_pairs(full_text, surface, cands)
                scored = [(score, cand, "reranker") for cand, score in pairs]
                reading, conf, source = _pick_constrained(
                    cands, scored, base, self._threshold
                )
                if source == "reranker":
                    return reading, conf, source, cands[:6]
            except Exception as exc:  # noqa: BLE001
                print(f"[reading_engine] reranker score failed: {exc}", file=sys.stderr)

        # 5) 低確信キュー / base フォールバック
        reading, conf, source = _pick_constrained(
            cands, cue_scored, base, self._threshold
        )
        return reading, conf, source, cands[:6]

    def analyze(self, text: str, user_dict: list[dict[str, str]] | None = None) -> dict[str, Any]:
        text = strip_annotation_markers(text)
        user_map = {
            e["surface"]: normalize_reading(e["reading"])
            for e in (user_dict or [])
            if e.get("surface") and e.get("reading")
        }
        # 人名＋固定リストは形態素分割前に最長一致（経沢→つねざわ など）
        phrase_map = dict(load_personal_name_phrases())
        phrase_map.update(MANUAL_PHRASES)
        phrase_map.update(user_map)
        phrase_spans = collect_phrase_spans(text, phrase_map)

        words = list(self.tagger(text))
        cursor = 0
        exact_word_spans: set[tuple[int, int, str]] = set()
        for word in words:
            surface = word.surface
            start = text.find(surface, cursor)
            if start < 0:
                start = cursor
            end = start + len(surface)
            cursor = end
            exact_word_spans.add((start, end, surface))

        tokens: list[dict[str, Any]] = []
        for start, end, surface, reading in phrase_spans:
            if surface not in user_map:
                if match_trust_reading(surface, text, (start, end)):
                    continue
                # 同形異音は lattice（cue / reranker）へ回す
                if len(self.heteronyms.get(surface, [])) >= 2:
                    continue
            tokens.append(
                {
                    "surface": surface,
                    "span": [start, end],
                    "reading": reading,
                    "confidence": 1.0,
                    "source": "user_dict" if surface in user_map else "personal_name",
                    "candidates": [reading],
                }
            )

        # 同形異音の複合表層（一日・町中など）を形態素分割前にキューで確定
        def overlaps_existing(start: int, end: int) -> bool:
            for t in tokens:
                p0, p1 = t["span"]
                if start < p1 and end > p0:
                    return True
            return False

        for start, end, surface, reading, conf, cands in collect_context_rule_spans(text):
            if overlaps_existing(start, end):
                continue
            # 既に単一トークンとして扱える表層は通常ラティスへ流し、候補を減らさない。
            if (start, end, surface) in exact_word_spans:
                continue
            tokens.append(
                {
                    "surface": surface,
                    "span": [start, end],
                    "reading": reading,
                    "confidence": conf,
                    "source": "cue",
                    "candidates": cands,
                }
            )

        def overlaps_phrase(start: int, end: int) -> bool:
            for t in tokens:
                p0, p1 = t["span"]
                if start < p1 and end > p0:
                    return True
            return False

        cursor = 0

        for word in words:
            surface = word.surface
            start = text.find(surface, cursor)
            if start < 0:
                start = cursor
            end = start + len(surface)
            cursor = end

            if overlaps_phrase(start, end):
                continue

            # 1) user_dict exact surface（単漢字など最長一致に乗らなかったもの）
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
                # 読みなしでも表層を返し、デモ／拡張で手動登録できるようにする
                tokens.append(
                    {
                        "surface": surface,
                        "span": [start, end],
                        "reading": base or "",
                        "confidence": 0.5 if base else 0.0,
                        "source": "base_engine" if base else "unset",
                        "candidates": [base] if base else [],
                    }
                )
                continue

            reading, conf, source, out_cands = self._select_reading(
                surface, base, cands, text, (start, end)
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

        # 創作ルビの複合表層（氷菓など）。1文字（星・月）は形態素側の
        # _score_cue に任せ、ここで差し込むと「金星」を「星」だけに壊す。
        creative_extra: list[dict[str, Any]] = []
        for entry in self.creative:
            surface = entry.surface
            if len(surface) < 2:
                continue
            search_from = 0
            while True:
                idx = text.find(surface, search_from)
                if idx < 0:
                    break
                end = idx + len(surface)
                search_from = idx + 1
                local = clause_context(text, (idx, end))
                hits = [c for c in entry.cues if c in local]
                if not hits and entry.genre not in ("lyric", "novel"):
                    continue
                if not hits and not any(
                    k in local for k in ("夏", "君", "恋", "風", "木陰", "口に")
                ):
                    if surface != "氷菓":
                        continue
                # より長い既存トークンの内部をくり抜かない（金星⊃星 の保険）
                if any(
                    t["span"][0] <= idx
                    and t["span"][1] >= end
                    and (t["span"][1] - t["span"][0]) > len(surface)
                    for t in tokens
                ):
                    continue
                creative_cands = [entry.reading]
                if surface == "氷菓" and "ひょうか" not in creative_cands:
                    creative_cands.append("ひょうか")
                creative_extra.append(
                    {
                        "surface": surface,
                        "span": [idx, end],
                        "reading": entry.reading,
                        "confidence": 0.94 if hits else 0.8,
                        "source": "creative_ruby",
                        "candidates": creative_cands,
                    }
                )

        if creative_extra:
            def overlaps_creative(t: dict[str, Any]) -> bool:
                a, b = t["span"]
                for c in creative_extra:
                    c0, c1 = c["span"]
                    if a < c1 and b > c0:
                        return True
                return False

            tokens = [t for t in tokens if not overlaps_creative(t)]
            tokens.extend(creative_extra)
        tokens.sort(key=lambda t: t["span"][0])
        # 数字ラン（21 など）をギャップに載せる。助数詞漢字は別トークンのまま。
        tokens = merge_number_tokens(text, tokens)

        rebuilt = []
        pos = 0
        for t in tokens:
            if t["span"][0] > pos:
                rebuilt.append(text[pos : t["span"][0]])
            rebuilt.append(t["reading"] or text[t["span"][0] : t["span"][1]])
            pos = t["span"][1]
        if pos < len(text):
            rebuilt.append(text[pos:])
        # 数字はかなに展開済み。残る英数字以外をひらがな化する。
        full_reading = "".join(rebuilt).translate(_KATA_TO_HIRA)
        full_reading = unicodedata.normalize("NFKC", full_reading)

        return {"reading": full_reading, "tokens": tokens}


_engine: ReadingEngine | None = None


def get_engine() -> ReadingEngine:
    global _engine
    if _engine is None:
        _engine = ReadingEngine()
    return _engine
