import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

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
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/joyo-jukuji-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("joyo-jukuji phrases URL missing");
    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`joyo-jukuji phrases fetch failed: ${response.status}`);
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
export function installJoyoJukujiPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return joyoJukujiPhrases;
}

export function findJoyoJukujiMatchAt(text, index) {
  if (!joyoTrie) return null;
  return findLongestPhraseAt(joyoTrie, text, index);
}
