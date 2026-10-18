import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

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
    const parsed = await fetchGzipJsonDict("corporate-name-phrases.json.gz", {
      url,
      label: "corporate-name phrases"
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
export function installCorporateNamePhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return corporateNamePhrases;
}

export function findCorporateNameMatchAt(text, index) {
  if (!corporateTrie) return null;
  return findLongestPhraseAt(corporateTrie, text, index);
}
