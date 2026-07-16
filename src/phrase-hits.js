import { normalizeReading, normalizeUserReading } from "./reading-normalize.js";
import { MANUAL_PHRASE_READINGS } from "./reading-context.js";
import { findNeologdMatchAt, getNeologdReading } from "./neologd-phrases.js";
import { findLongestPhraseAt, buildPhraseTrie } from "./phrase-trie.js";

function normalizePhraseReading(reading, source) {
  // ユーザー／手動句はカタカナ登録を保持。NEologd 等はひらがなへ。
  if (source === "manual" || source === "user") {
    return normalizeUserReading(reading);
  }
  return normalizeReading(reading);
}

/**
 * テキスト上で、辞書系フレーズ（NEologd・手動・学習）の非重複最長一致を集める。
 * JRM の user_dict 優先枠に載せて「辞書＋JRM」併用する。
 *
 * @param {string} text
 * @param {Record<string, string>} [extraPhrases] 学習 phrases など
 * @returns {Array<{ surface: string, reading: string, start: number, end: number, source: string }>}
 */
export function collectLocalPhraseHits(text, extraPhrases = {}) {
  const source = String(text || "");
  if (!source) return [];

  const extraTrie = buildPhraseTrie({
    ...Object.fromEntries(MANUAL_PHRASE_READINGS),
    ...(extraPhrases || {})
  });

  /** @type {Array<{ surface: string, reading: string, start: number, end: number, source: string }>} */
  const hits = [];
  let index = 0;
  while (index < source.length) {
    const neo = findNeologdMatchAt(source, index);
    const manual = findLongestPhraseAt(extraTrie, source, index);

    let best = null;
    if (neo && manual) {
      best =
        neo.surface.length >= manual.surface.length
          ? { ...neo, source: "neologd" }
          : { ...manual, source: "manual" };
    } else if (neo) {
      best = { ...neo, source: "neologd" };
    } else if (manual) {
      best = { ...manual, source: "manual" };
    }

    if (best && best.surface.length >= 2) {
      hits.push({
        surface: best.surface,
        reading: normalizePhraseReading(best.reading, best.source),
        start: index,
        end: index + best.surface.length,
        source: best.source
      });
      index += best.surface.length;
      continue;
    }
    index += 1;
  }
  return hits;
}

/**
 * user_dict 用: 学習 phrases + 文中ヒットした NEologd/固定句。
 * 先に並べた方が同じ surface では優先されやすいが、API 実装は Map 化前提なので後勝ちに注意。
 * 学習 phrases を後から書いてユーザー登録を優先する。
 *
 * @param {string} text
 * @param {Record<string, string>} [userPhrases]
 * @returns {Record<string, string>}
 */
export function buildCombinedUserDict(text, userPhrases = {}) {
  const dict = {};
  for (const hit of collectLocalPhraseHits(text, userPhrases)) {
    if (!hit.surface || !hit.reading) continue;
    dict[hit.surface] = hit.reading;
  }
  for (const [surface, reading] of Object.entries(userPhrases || {})) {
    const normalized = normalizeUserReading(reading);
    if (surface && normalized) dict[surface] = normalized;
  }
  return dict;
}

/**
 * span API 応答にローカル句を上書き合成する（user_dict が効かなかったときの保険）。
 * @param {string} originalText
 * @param {Array<{ start: number, end: number, surface?: string, reading?: string }>} apiSpans
 * @param {Record<string, string>} [userPhrases]
 */
export function mergeSpansWithLocalPhrases(originalText, apiSpans, userPhrases = {}) {
  const text = String(originalText || "");
  const hits = collectLocalPhraseHits(text, userPhrases);
  if (hits.length === 0) return apiSpans || [];

  const phraseSpans = hits.map((hit) => ({
    start: hit.start,
    end: hit.end,
    surface: hit.surface,
    reading: hit.reading,
    source: hit.source
  }));

  const api = (apiSpans || [])
    .map((span) => ({
      start: span.start,
      end: span.end,
      surface: span.surface || text.slice(span.start, span.end),
      reading: normalizeReading(span.reading || ""),
      source: span.source || "api"
    }))
    .filter((span) => span.end > span.start);

  // 句を優先しつつ、重ならない API span を残す
  const selected = [...phraseSpans];
  for (const span of api) {
    const overlaps = selected.some(
      (other) => !(span.end <= other.start || span.start >= other.end)
    );
    if (!overlaps) selected.push(span);
  }
  selected.sort((a, b) => a.start - b.start || b.end - a.end);
  return selected;
}

/** @deprecated diagnostic helper */
export function peekNeologdReading(surface) {
  return getNeologdReading(surface);
}
