import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let placeNamePhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let placeTrie = null;
let loadPromise = null;

export function getPlaceNamePhraseCount() {
  return Object.keys(placeNamePhrases).length;
}

export function getPlaceNameReading(surface) {
  return placeNamePhrases[surface] || "";
}

export function getPlaceNamePhrasesObject() {
  return placeNamePhrases;
}

export function getPlaceNamePhraseTrie() {
  return placeTrie;
}

function installParsedPhrases(parsed) {
  placeNamePhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    placeNamePhrases[surface] = normalized;
  }
  placeTrie = buildPhraseTrie(placeNamePhrases);
  return placeNamePhrases;
}

/**
 * @param {string} [url]
 */
export async function loadPlaceNamePhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("place-name-phrases.json.gz", {
      url,
      label: "place-name phrases"
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
export function installPlaceNamePhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return placeNamePhrases;
}

export function findPlaceNameMatchAt(text, index) {
  if (!placeTrie) return null;
  return findLongestPhraseAt(placeTrie, text, index);
}
