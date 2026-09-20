import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

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
    const parsed = await fetchGzipJsonDict("ja-furigana-phrases.json.gz", {
      url,
      label: "ja-furigana phrases"
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
