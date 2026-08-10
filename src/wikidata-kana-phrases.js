import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

/** @type {Record<string, string>} */
let wikidataKanaPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let wikidataTrie = null;
let loadPromise = null;

export function getWikidataKanaPhraseCount() {
  return Object.keys(wikidataKanaPhrases).length;
}

export function getWikidataKanaReading(surface) {
  return wikidataKanaPhrases[surface] || "";
}

export function getWikidataKanaPhrasesObject() {
  return wikidataKanaPhrases;
}

function installParsedPhrases(parsed) {
  wikidataKanaPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    wikidataKanaPhrases[surface] = normalized;
  }
  wikidataTrie = buildPhraseTrie(wikidataKanaPhrases);
  return wikidataKanaPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadWikidataKanaPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/wikidata-kana-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("wikidata-kana phrases URL missing");
    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`wikidata-kana phrases fetch failed: ${response.status}`);
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
 * @param {Record<string, string>} phrases
 */
export function installWikidataKanaPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return wikidataKanaPhrases;
}

export function findWikidataKanaMatchAt(text, index) {
  if (!wikidataTrie) return null;
  return findLongestPhraseAt(wikidataTrie, text, index);
}
