import { normalizeReading } from "./reading-normalize.js";
import {
  CONTEXT_READING_RULES,
  MANUAL_PHRASE_READINGS
} from "./reading-context.js";
import heteronymCandidates from "../data/generated/heteronym-candidates.json" with {
  type: "json"
};

const MAX_CANDIDATES = 8;

/** 同形異音で漏れやすい語の最低限候補（辞書 JSON に無い場合の保険） */
const EXTRA_HETERONYM_READINGS = {
  空: ["そら", "くう", "から"],
  方: ["ほう", "かた"],
  中: ["なか", "ちゅう", "じゅう"],
  何: ["なに", "なん"],
  何故: ["なぜ", "なにゆえ", "なんゆえ"],
  何故か: ["なぜか", "なにゆえか", "なんゆえか"],
  何故に: ["なぜに", "なにゆえに", "なんゆえに"],
  直書き: ["じかがき"],
  直: ["じか", "なお", "ちょく"]
};

/**
 * 表層に対する読み候補を集める（IMEの変換候補に相当）。
 * 既存の同形異音辞書があれば、現在の読み以外も必ず候補に含める。
 * @param {string} surface
 * @param {string} [currentReading]
 * @param {string} [contextText]
 * @param {Record<string, string>} [userDict]
 * @returns {{ reading: string, source: string, label: string }[]}
 */
export function collectReadingCandidates(
  surface,
  currentReading = "",
  contextText = "",
  userDict = {}
) {
  if (!surface) return [];

  /** @type {Map<string, { reading: string, source: string, label: string, score: number }>} */
  const map = new Map();

  function add(reading, source, label, score = 1) {
    const normalized = normalizeReading(reading);
    if (!normalized) return;
    const prev = map.get(normalized);
    if (prev && prev.score >= score) return;
    map.set(normalized, { reading: normalized, source, label, score });
  }

  const current = normalizeReading(currentReading);
  if (current) add(current, "current", "現在", 10);

  if (userDict[surface]) {
    add(userDict[surface], "user", "学習済み", 9);
  }

  if (MANUAL_PHRASE_READINGS.has(surface)) {
    add(MANUAL_PHRASE_READINGS.get(surface), "manual", "固定", 8);
  }

  for (const [phrase, reading] of MANUAL_PHRASE_READINGS) {
    if (phrase === surface) continue;
    // 短い表層に長い複合語の読みを混ぜない（何 → なぜか は不可）
    // 長い表層が短い固定句を含む場合だけ参考にする（何故かが 何故 を含む等）
    if (surface.includes(phrase) && phrase.length >= 2) {
      add(reading, "manual", "固定", 5);
    }
  }

  const context = contextText || "";
  for (const rule of CONTEXT_READING_RULES) {
    // 表層一致、またはより長い表層が rule.surface で始まる場合のみ
    // （何故 → 何 方向の漏れを防ぐ）
    if (rule.surface !== surface && !surface.startsWith(rule.surface)) {
      continue;
    }
    let score = 3;
    const hit = (rule.cues || []).some((cue) => context.includes(cue));
    if (hit) score = 7;
    add(rule.reading, "context", hit ? "文脈" : "候補", score);
  }

  const dictReadings = heteronymCandidates[surface];
  if (Array.isArray(dictReadings)) {
    for (const reading of dictReadings) {
      add(reading, "dict", "辞書", 4);
    }
  }

  const extra = EXTRA_HETERONYM_READINGS[surface];
  if (Array.isArray(extra)) {
    for (const reading of extra) {
      add(reading, "dict", "辞書", 4);
    }
  }

  // 部分一致（何 → 何か は別語なので exact 優先。短い表層の完全一致のみ）
  if (!dictReadings && !extra && surface.length >= 2) {
    for (const [key, readings] of Object.entries(heteronymCandidates)) {
      if (key === surface) continue;
      if (key.length <= surface.length + 1 && (key.startsWith(surface) || surface.startsWith(key))) {
        for (const reading of readings) add(reading, "dict", "辞書", 2);
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => b.score - a.score || a.reading.localeCompare(b.reading, "ja"))
    .slice(0, MAX_CANDIDATES)
    .map(({ reading, source, label }) => ({ reading, source, label }));
}
