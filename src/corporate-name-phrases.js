import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

/** @type {Record<string, string>} */
let corporateNamePhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let corporateTrie = null;
let loadPromise = null;

export function getCorporateNamePhraseCount() {
  return Object.keys(corporateNamePhrases).length;
}

export function getCorporateNameReading(surface) {
  return corporateNamePhrases[surface] || "";
}

export function getCorporateNamePhrasesObject() {
  return corporateNamePhrases;
}

function installParsedPhrases(parsed) {
  corporateNamePhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    corporateNamePhrases[surface] = normalized;
  }
  corporateTrie = buildPhraseTrie(corporateNamePhrases);
  return corporateNamePhrases;
}

/**
 * @param {string} [url]
 */
export async function loadCorporateNamePhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/corporate-name-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("corporate-name phrases URL missing");
    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`corporate-name phrases fetch failed: ${response.status}`);
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
export function installCorporateNamePhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return corporateNamePhrases;
}

export function findCorporateNameMatchAt(text, index) {
  if (!corporateTrie) return null;
  return findLongestPhraseAt(corporateTrie, text, index);
}
