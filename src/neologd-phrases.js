import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

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
 * Chrome では DecompressionStream を使う（node:zlib はバンドルしない）。
 * @param {string} [url]
 */
export async function loadNeologdPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/neologd-phrases.json.gz")
        : "");
    if (!dictUrl) {
      throw new Error("neologd phrases URL missing");
    }

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`neologd phrases fetch failed: ${response.status}`);
    }

    if (typeof DecompressionStream !== "function") {
      throw new Error("DecompressionStream is not available");
    }

    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const jsonText = await new Response(stream).text();
    return installParsedPhrases(JSON.parse(jsonText));
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
