/**
 * UniDic 由来の漢語名詞フレーズ（表層→読み）。
 * 辞書: dict/unidic-phrases.json.gz
 */

import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let unidicPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let phraseTrie = null;
let loadPromise = null;

export function getUnidicPhraseCount() {
  return Object.keys(unidicPhrases).length;
}

export function getUnidicReading(surface) {
  return unidicPhrases[surface] || "";
}

/** 結合 Trie 用（参照を返す。破壊しないこと） */
export function getUnidicPhrasesObject() {
  return unidicPhrases;
}

export function getUnidicPhraseTrie() {
  return phraseTrie;
}

/**
 * @param {Record<string, string>} dict
 */
export function installUnidicPhrasesForTests(dict) {
  unidicPhrases = {};
  for (const [surface, reading] of Object.entries(dict || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || !normalized) continue;
    unidicPhrases[surface] = normalized;
  }
  phraseTrie = buildPhraseTrie(unidicPhrases);
  return unidicPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadUnidicPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("unidic-phrases.json.gz", {
      url,
      label: "unidic-phrases"
    });
    installUnidicPhrasesForTests(parsed);
    return unidicPhrases;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    unidicPhrases = {};
    phraseTrie = null;
    throw error;
  }
}
