import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let sudachiFullPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let sudachiFullTrie = null;
let loadPromise = null;

export function getSudachiFullPhraseCount() {
  return Object.keys(sudachiFullPhrases).length;
}

export function getSudachiFullReading(surface) {
  return sudachiFullPhrases[surface] || "";
}

export function getSudachiFullPhrasesObject() {
  return sudachiFullPhrases;
}

function installParsedPhrases(parsed) {
  sudachiFullPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    sudachiFullPhrases[surface] = normalized;
  }
  sudachiFullTrie = buildPhraseTrie(sudachiFullPhrases);
  return sudachiFullPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadSudachiFullPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("sudachi-full-phrases.json.gz", {
      url,
      label: "sudachi-full phrases"
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
export function installSudachiFullPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return sudachiFullPhrases;
}

export function findSudachiFullMatchAt(text, index) {
  if (!sudachiFullTrie) return null;
  return findLongestPhraseAt(sudachiFullTrie, text, index);
}
