/**
 * UniDic 由来の漢語名詞フレーズ（表層→読み）。
 * 辞書: dict/unidic-phrases.json.gz
 */

import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie } from "./phrase-trie.js";

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
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/unidic-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("unidic-phrases URL missing");

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`unidic-phrases fetch failed: ${response.status}`);
    }
    if (typeof DecompressionStream !== "function") {
      throw new Error("DecompressionStream is not available");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const jsonText = await new Response(stream).text();
    const parsed = JSON.parse(jsonText);
    installUnidicPhrasesForTests(parsed && typeof parsed === "object" ? parsed : {});
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
