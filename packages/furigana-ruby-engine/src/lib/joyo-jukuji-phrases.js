import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

/** @type {Record<string, string>} */
let joyoJukujiPhrases = {};
/** @type {ReturnType<typeof buildPhraseTrie> | null} */
let joyoTrie = null;
let loadPromise = null;

export function getJoyoJukujiPhraseCount() {
  return Object.keys(joyoJukujiPhrases).length;
}

export function getJoyoJukujiReading(surface) {
  return joyoJukujiPhrases[surface] || "";
}

export function getJoyoJukujiPhrasesObject() {
  return joyoJukujiPhrases;
}

function installParsedPhrases(parsed) {
  joyoJukujiPhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    joyoJukujiPhrases[surface] = normalized;
  }
  joyoTrie = buildPhraseTrie(joyoJukujiPhrases);
  return joyoJukujiPhrases;
}

/**
 * @param {string} [url]
 */
export async function loadJoyoJukujiPhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("joyo-jukuji-phrases.json.gz", {
      url,
      label: "joyo-jukuji phrases"
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
export function installJoyoJukujiPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return joyoJukujiPhrases;
}

export function findJoyoJukujiMatchAt(text, index) {
  if (!joyoTrie) return null;
  return findLongestPhraseAt(joyoTrie, text, index);
}
