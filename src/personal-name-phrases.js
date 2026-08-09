import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { getNeologdPhrasesObject } from "./neologd-phrases.js";
import { getPlaceNamePhrasesObject } from "./place-name-phrases.js";
import { getStationPhrasesObject } from "./station-phrases.js";
import { getUnidicPhrasesObject } from "./unidic-phrases.js";

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
 * NEologd + UniDic 漢語 + 地名 + 駅 + 人名。
 * 同表層は後勝ち（人名 > 駅 > 地名 > UniDic > NEologd）。
 * 長い表層は Trie の最長一致が勝つ。
 * 駅を地名の後にする理由: KEN_ALL の「十三」→じゅうさん を「じゅうそう」で上書き。
 */
export function getCombinedPhraseTrie() {
  if (combinedTrie) return combinedTrie;
  return rebuildCombined();
}

/** NEologd / 地名 / 駅 / UniDic 再読込後など、キャッシュを捨てて作り直す */
export function rebuildCombinedPhraseTrie() {
  return rebuildCombined();
}

function rebuildCombined() {
  combinedTrie = buildPhraseTrie({
    ...getNeologdPhrasesObject(),
    ...getUnidicPhrasesObject(),
    ...getPlaceNamePhrasesObject(),
    ...getStationPhrasesObject(),
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
