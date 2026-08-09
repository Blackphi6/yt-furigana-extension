import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

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
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/place-name-phrases.json.gz")
        : "");
    if (!dictUrl) {
      throw new Error("place-name phrases URL missing");
    }

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`place-name phrases fetch failed: ${response.status}`);
    }

    let jsonText = "";
    if (dictUrl.endsWith(".gz")) {
      if (typeof DecompressionStream !== "function") {
        throw new Error("DecompressionStream is not available");
      }
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      jsonText = await new Response(stream).text();
    } else {
      jsonText = await response.text();
    }
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
export function installPlaceNamePhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return placeNamePhrases;
}

export function findPlaceNameMatchAt(text, index) {
  if (!placeTrie) return null;
  return findLongestPhraseAt(placeTrie, text, index);
}
