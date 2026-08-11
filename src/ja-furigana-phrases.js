import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

/** @type {Record<string, string>} */
let jaFuriganaPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let jaFuriganaTrie = null;
let loadPromise = null;

export function getJaFuriganaPhraseCount() {
  return Object.keys(jaFuriganaPhrases).length;
}

export function getJaFuriganaReading(surface) {
  return jaFuriganaPhrases[surface] || "";
}

export function getJaFuriganaPhrasesObject() {
  return jaFuriganaPhrases;
}

function installParsedPhrases(parsed) {
  jaFuriganaPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    jaFuriganaPhrases[surface] = normalized;
  }
  jaFuriganaTrie = buildPhraseTrie(jaFuriganaPhrases);
  return jaFuriganaPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadJaFuriganaPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/ja-furigana-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("ja-furigana phrases URL missing");
    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`ja-furigana phrases fetch failed: ${response.status}`);
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
export function installJaFuriganaPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return jaFuriganaPhrases;
}

export function findJaFuriganaMatchAt(text, index) {
  if (!jaFuriganaTrie) return null;
  return findLongestPhraseAt(jaFuriganaTrie, text, index);
}
