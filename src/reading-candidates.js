import { normalizeReading, normalizeUserReading } from "./reading-normalize.js";
import {
  CONTEXT_READING_RULES,
  MANUAL_PHRASE_READINGS
} from "./reading-context.js";
import {
  matchUserContextualReadings,
  normalizeUserReadingStore
} from "./user-reading-dict.js";
import heteronymCandidates from "../data/generated/heteronym-candidates.json" with {
  type: "json"
};
import { getNeologdReading } from "./neologd-phrases.js";
import {
  readingForNumberSurface,
  readingForNumberUnitSurface,
  parseNumberSurface,
  parseNumberUnitSurface,
  parseDotSeparatedDigits,
  readingForDotSeparatedDigits
} from "./number-unit-reading.js";

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
  何度: ["なんど"],
  何回: ["なんかい"],
  何人: ["なんにん"],
  永遠: ["えいえん", "とわ"],
  大事: ["だいじ", "おおごと"],
  町中: ["まちなか", "まちじゅう"],
  直書き: ["じかがき"],
  直: ["じか", "なお", "ちょく"]
};

/**
 * 表層に対する読み候補を集める（IMEの変換候補に相当）。
 * @param {string} surface
 * @param {string} [currentReading]
 * @param {string} [contextText]
 * @param {Record<string, string> | object} [userDictOrStore]
 * @returns {{ reading: string, source: string, label: string }[]}
 */
export function collectReadingCandidates(
  surface,
  currentReading = "",
  contextText = "",
  userDictOrStore = {}
) {
  if (!surface) return [];

  /** @type {Map<string, { reading: string, source: string, label: string, score: number }>} */
  const map = new Map();

  function add(reading, source, label, score = 1) {
    // ユーザー由来はカタカナ保持。その他はひらがなキーで重複排除。
    const normalized =
      source === "user" || source === "current" || source === "manual"
        ? normalizeUserReading(reading)
        : normalizeReading(reading);
    if (!normalized) return;
    const key = normalizeReading(normalized);
    const prev = map.get(key);
    if (prev && prev.score >= score) return;
    // 同じ音でカタカナ版が新しく来たら表示を更新
    map.set(key, { reading: normalized, source, label, score });
  }

  const current = normalizeUserReading(currentReading);
  if (current) add(current, "current", "現在", 10);

  const store = normalizeUserReadingStore(
    userDictOrStore &&
      typeof userDictOrStore === "object" &&
      ("phrases" in userDictOrStore ||
        "contextRules" in userDictOrStore ||
        "version" in userDictOrStore)
      ? userDictOrStore
      : { version: 2, phrases: userDictOrStore || {}, contextRules: [] }
  );

  for (const reading of matchUserContextualReadings(
    surface,
    contextText,
    store
  )) {
    const contextualHit = store.contextRules.some(
      (rule) =>
        rule.surface === surface &&
        rule.reading === reading &&
        rule.cues.some((cue) => String(contextText || "").includes(cue))
    );
    add(
      reading,
      "user",
      contextualHit ? "学習（文脈）" : "学習済み",
      contextualHit ? 9.5 : 9
    );
  }

  if (MANUAL_PHRASE_READINGS.has(surface)) {
    add(MANUAL_PHRASE_READINGS.get(surface), "manual", "固定", 8);
  }

  const neo = getNeologdReading(surface);
  if (neo) add(neo, "neologd", "固有名詞", 7.5);

  for (const [phrase, reading] of MANUAL_PHRASE_READINGS) {
    if (phrase === surface) continue;
    if (surface.includes(phrase) && phrase.length >= 2) {
      add(reading, "manual", "固定", 5);
    }
  }

  const context = contextText || "";
  for (const rule of CONTEXT_READING_RULES) {
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

  // 数字・数字＋単位の規則読みと逐語候補
  const numberUnit = parseNumberUnitSurface(surface);
  const numberOnly = parseNumberSurface(surface);
  const dotParts = parseDotSeparatedDigits(surface);
  if (numberUnit || numberOnly || dotParts) {
    const primary =
      (numberUnit && readingForNumberUnitSurface(surface)) ||
      (dotParts && readingForDotSeparatedDigits(surface)) ||
      (numberOnly && readingForNumberSurface(surface)) ||
      "";
    if (primary) add(primary, "number", "数詞", 6);
    const digits = String(surface || "")
      .normalize("NFKC")
      .replace(/[^0-9]/g, "");
    if (digits.length >= 1) {
      const seqHira = [...digits]
        .map((d) => ["ぜろ", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"][Number(d)] || "")
        .join("");
      if (seqHira && seqHira !== normalizeReading(primary)) {
        add(seqHira, "number", "逐語", 3);
      }
      const seqKata = [...digits]
        .map(
          (d) =>
            ["ゼロ", "イチ", "ニー", "サン", "ヨン", "ゴー", "ロク", "ナナ", "ハチ", "キュー"][
              Number(d)
            ] || ""
        )
        .join("");
      if (seqKata) add(seqKata, "number", "逐語カナ", 2.5);
    }
  }

  if (!dictReadings && !extra && surface.length >= 2) {
    for (const [key, readings] of Object.entries(heteronymCandidates)) {
      if (key === surface) continue;
      if (
        key.length <= surface.length + 1 &&
        (key.startsWith(surface) || surface.startsWith(key))
      ) {
        for (const reading of readings) add(reading, "dict", "辞書", 2);
      }
    }
  }

  return [...map.values()]
    .sort((a, b) => b.score - a.score || a.reading.localeCompare(b.reading, "ja"))
    .slice(0, MAX_CANDIDATES)
    .map(({ reading, source, label }) => ({ reading, source, label }));
}
