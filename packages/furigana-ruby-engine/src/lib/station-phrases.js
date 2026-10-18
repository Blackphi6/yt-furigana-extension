import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let stationPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let stationTrie = null;
let loadPromise = null;

export function getStationPhraseCount() {
  return Object.keys(stationPhrases).length;
}

export function getStationReading(surface) {
  return stationPhrases[surface] || "";
}

export function getStationPhrasesObject() {
  return stationPhrases;
}

export function getStationPhraseTrie() {
  return stationTrie;
}

function installParsedPhrases(parsed) {
  stationPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    stationPhrases[surface] = normalized;
  }
  stationTrie = buildPhraseTrie(stationPhrases);
  return stationPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadStationPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("station-phrases.json.gz", {
      url,
      label: "station phrases"
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
export function installStationPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return stationPhrases;
}

export function findStationMatchAt(text, index) {
  if (!stationTrie) return null;
  return findLongestPhraseAt(stationTrie, text, index);
}
