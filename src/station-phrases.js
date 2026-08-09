import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

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
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/station-phrases.json.gz")
        : "");
    if (!dictUrl) {
      throw new Error("station phrases URL missing");
    }

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`station phrases fetch failed: ${response.status}`);
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
export function installStationPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return stationPhrases;
}

export function findStationMatchAt(text, index) {
  if (!stationTrie) return null;
  return findLongestPhraseAt(stationTrie, text, index);
}
