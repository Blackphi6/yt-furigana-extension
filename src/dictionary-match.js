import heteronymCandidates from "../data/generated/heteronym-candidates.json" with {
  type: "json"
};
import { findNeologdMatchAt } from "./neologd-phrases.js";

/** 形態素がバラけやすい複合語の保険 */
const EXTRA_COMPOUND_SURFACES = [
  "何故",
  "何故か",
  "何故に",
  "如何",
  "如何に",
  "如何して",
  "何方",
  "何れ",
  "何度",
  "何回",
  "何人",
  "何年",
  "何枚",
  "何冊",
  "何階",
  "何倍",
  "彼是",
  "兎に角",
  "流石",
  "直書き"
];

let cachedSurfaces = null;
let cachedSorted = null;

/**
 * 最長一致用の表層集合（heteronym + 追加複合語）。
 * @param {Iterable<string>} [extra]
 */
export function getDictionarySurfaces(extra = []) {
  if (!cachedSurfaces) {
    cachedSurfaces = new Set([
      ...Object.keys(heteronymCandidates),
      ...EXTRA_COMPOUND_SURFACES
    ]);
  }
  if (!extra || (typeof extra[Symbol.iterator] === "function" && ![...extra].length)) {
    return cachedSurfaces;
  }
  const merged = new Set(cachedSurfaces);
  for (const surface of extra) {
    if (surface) merged.add(surface);
  }
  return merged;
}

function getSortedSurfaces(surfaces) {
  if (surfaces === cachedSurfaces && cachedSorted) return cachedSorted;
  const sorted = [...surfaces].sort((a, b) => b.length - a.length);
  if (surfaces === cachedSurfaces) cachedSorted = sorted;
  return sorted;
}

/**
 * text[index] から始まる辞書表層の最長一致。
 * @param {string} text
 * @param {number} index
 * @param {Set<string>} [surfaces]
 * @returns {string | null}
 */
export function findLongestDictionaryMatchAt(text, index, surfaces = getDictionarySurfaces()) {
  if (!text || index < 0 || index >= text.length) return null;
  const neo = findNeologdMatchAt(text, index);
  const sorted = getSortedSurfaces(surfaces);
  let dictBest = null;
  for (const surface of sorted) {
    if (surface.length <= 1) continue;
    if (text.startsWith(surface, index)) {
      dictBest = surface;
      break;
    }
  }
  if (neo && dictBest) {
    return neo.surface.length >= dictBest.length ? neo.surface : dictBest;
  }
  return neo?.surface || dictBest;
}

/**
 * クリックした表層を、文脈上の辞書最長一致へ拡張する。
 * @param {string} surface
 * @param {string} contextText
 * @param {Set<string>} [surfaces]
 */
export function expandSurfaceWithDictionary(
  surface,
  contextText,
  surfaces = getDictionarySurfaces()
) {
  if (!surface) return surface;
  const context = String(contextText || "");
  if (!context) return surface;

  const index = context.indexOf(surface);
  if (index < 0) return surface;

  let best = findLongestDictionaryMatchAt(context, index, surfaces);

  for (let start = Math.max(0, index - 6); start < index; start += 1) {
    const match = findLongestDictionaryMatchAt(context, start, surfaces);
    if (!match) continue;
    const matchEnd = start + match.length;
    if (matchEnd < index + surface.length) continue;
    if (!best || match.length > best.length) best = match;
  }

  return best && best.length > surface.length ? best : surface;
}
