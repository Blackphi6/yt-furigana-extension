import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let neologdPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let phraseTrie = null;
let loadPromise = null;

export function getNeologdPhraseCount() {
  return Object.keys(neologdPhrases).length;
}

export function getNeologdPhraseTrie() {
  return phraseTrie;
}

export function getNeologdReading(surface) {
  return neologdPhrases[surface] || "";
}

/** 結合 Trie 用（コピーしない参照。呼び出し側で破壊しないこと） */
export function getNeologdPhrasesObject() {
  return neologdPhrases;
}

function installParsedPhrases(parsed) {
  neologdPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || !normalized) continue;
    neologdPhrases[surface] = normalized;
  }
  phraseTrie = buildPhraseTrie(neologdPhrases);
  return neologdPhrases;
}

/**
 * 生成済み gzip 辞書を読み、Trie を構築する。
 * @param {string} [url]
 */
export async function loadNeologdPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("neologd-phrases.json.gz", {
      url,
      label: "neologd phrases"
    });
    return installParsedPhrases(parsed);
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

/**
 * テスト／Node 向け: 既に展開済みの phrases を注入する。
 * @param {Record<string, string>} phrases
 */
export function installNeologdPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return neologdPhrases;
}

export function findNeologdMatchAt(text, index) {
  if (!phraseTrie) return null;
  return findLongestPhraseAt(phraseTrie, text, index);
}
