import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";

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
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/sudachi-full-phrases.json.gz")
        : "");
    if (!dictUrl) throw new Error("sudachi-full phrases URL missing");
    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`sudachi-full phrases fetch failed: ${response.status}`);
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
export function installSudachiFullPhrasesForTests(phrases) {
  loadPromise = Promise.resolve(installParsedPhrases(phrases));
  return sudachiFullPhrases;
}

export function findSudachiFullMatchAt(text, index) {
  if (!sudachiFullTrie) return null;
  return findLongestPhraseAt(sudachiFullTrie, text, index);
}
