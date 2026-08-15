import { normalizeReading } from "./reading-normalize.js";
import { buildPhraseTrie, findLongestPhraseAt } from "./phrase-trie.js";
import { getNeologdPhrasesObject } from "./neologd-phrases.js";
import { getPlaceNamePhrasesObject } from "./place-name-phrases.js";
import { getStationPhrasesObject } from "./station-phrases.js";
import { getUnidicPhrasesObject } from "./unidic-phrases.js";
import { getJoyoJukujiPhrasesObject } from "./joyo-jukuji-phrases.js";
import { getJaFuriganaPhrasesObject } from "./ja-furigana-phrases.js";
import { getWikidataKanaPhrasesObject } from "./wikidata-kana-phrases.js";
import { getSudachiFullPhrasesObject } from "./sudachi-full-phrases.js";
import { getCorporateNamePhrasesObject } from "./corporate-name-phrases.js";
import {
  filterPhraseMap,
  PERSONAL_NAME_SURFACE_BLOCKLIST,
  PHRASE_TRIE_OVERRIDES,
  PRODUCT_READING_OVERRIDES
} from "./phrase-trie-guards.js";
import { fetchGzipJsonDict } from "./dict-gzip-fetch.js";

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
 * NEologd + UniDic + 常用漢字付表 + ja-furigana熟語 + Wikidata + Sudachi Full固有
 * + 地名 + 駅 + 法人 + 人名。
 * 同表層は後勝ち。長い表層は Trie の最長一致が勝つ。
 * 付表/ja-furigana を UniDic の後: 熟字訓・難読を優先。
 * 駅を地名の後: KEN_ALL「十三」じゅうさん → 駅「じゅうそう」。
 * 法人を駅の後: 長い正式社名を優先。人名を最後: 短い姓を守る。
 */
export function getCombinedPhraseTrie() {
  if (combinedTrie) return combinedTrie;
  return rebuildCombined();
}

/** 各フレーズ辞書の再読込後など、キャッシュを捨てて作り直す */
export function rebuildCombinedPhraseTrie(options = {}) {
  return rebuildCombined(options);
}

function rebuildCombined(options = {}) {
  const includeProduct = options.includeProductReadings !== false;
  combinedTrie = buildPhraseTrie({
    ...getNeologdPhrasesObject(),
    ...getUnidicPhrasesObject(),
    ...getJoyoJukujiPhrasesObject(),
    ...getJaFuriganaPhrasesObject(),
    ...getWikidataKanaPhrasesObject(),
    ...getSudachiFullPhrasesObject(),
    ...filterPhraseMap(getPlaceNamePhrasesObject(), { skipPlaceParticle: true }),
    ...getStationPhrasesObject(),
    ...getCorporateNamePhrasesObject(),
    ...filterPhraseMap(personalNamePhrases, { skipPersonalBlocklist: true }),
    ...PHRASE_TRIE_OVERRIDES,
    ...(includeProduct ? PRODUCT_READING_OVERRIDES : {})
  });
  return combinedTrie;
}

function installParsedPhrases(parsed) {
  personalNamePhrases = {};
  for (const [surface, reading] of Object.entries(parsed || {})) {
    const normalized = normalizeReading(reading);
    if (!surface || surface.length < 2 || !normalized) continue;
    if (PERSONAL_NAME_SURFACE_BLOCKLIST.has(surface)) continue;
    personalNamePhrases[surface] = normalized;
  }
  personalTrie = buildPhraseTrie(personalNamePhrases);
  // 結合 Trie は phrase-dict-boot 側で一括 rebuild（辞書ごとだと YouTube が止まる）
  combinedTrie = null;
  return personalNamePhrases;
}

/**
 * @param {string} [url]
 */
export async function loadPersonalNamePhrases(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const parsed = await fetchGzipJsonDict("personal-name-phrases.json.gz", {
      url,
      label: "personal-name phrases"
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
