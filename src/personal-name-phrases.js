import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { getNeologdPhrasesObject } from "./neologd-phrases.js";

/** @type {Record<string, string>} */
let personalNamePhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let personalTrie = null;
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let combinedTrie = null;
let loadPromise = null;

export function getPersonalNamePhraseCount() {
  return Object.keys(personalNamePhrases).length;
}

export function getPersonalNameReading(surface) {
  return personalNamePhrases[surface] || "";
}

export function getPersonalNamePhraseTrie() {
  return personalTrie;
}

/**
 * NEologd + 人名。同表層は人名側を優先（姓のまとまり読み用）。
 */
export function getCombinedPhraseTrie() {
  if (combinedTrie) return combinedTrie;
  return rebuildCombined();
}

/** NEologd 再読込後など、キャッシュを捨てて作り直す */
export function rebuildCombinedPhraseTrie() {
  return rebuildCombined();
}

function rebuildCombined() {
  combinedTrie = buildPhraseTrie({
    ...getNeologdPhrasesObject(),
    ...personalNamePhrases
  });
  return combinedTrie;
}

function installParsedPhrases(parsed) {
  personalNamePhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    personalNamePhrases[surface] = normalized;
  }
  personalTrie = buildPhraseTrie(personalNamePhrases);
  rebuildCombined();
  return personalNamePhrases;
}

/**
 * @param {string} [url]
 */
export async function loadPersonalNamePhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/personal-name-phrases.json.gz")
        : "");
    if (!dictUrl) {
      throw new Error("personal-name phrases URL missing");
    }

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`personal-name phrases fetch failed: ${response.status}`);
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
export function installPersonalNamePhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return personalNamePhrases;
}

export function findPersonalNameMatchAt(text, index) {
  if (!personalTrie) return null;
  return findLongestPhraseAt(personalTrie, text, index);
}

export function findCombinedPhraseMatchAt(text, index) {
  const trie = getCombinedPhraseTrie();
  if (!trie) return null;
  return findLongestPhraseAt(trie, text, index);
}
