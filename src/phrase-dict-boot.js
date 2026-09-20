/**
 * フレーズ辞書の起動ティア。
 * kuromoji と同時に待つのは小型のみ。法人・地名など数十MBは既定で載せない
 * （JSON.parse + 結合 Trie 再構築が YouTube 本編を止める）。
 */
import { loadNeologdPhrases, getNeologdPhraseCount } from "./neologd-phrases.js";
import {
  loadPlaceNamePhrases,
  getPlaceNamePhraseCount
} from "./place-name-phrases.js";
import {
  loadStationPhrases,
  getStationPhraseCount
} from "./station-phrases.js";
import {
  loadCorporateNamePhrases,
  getCorporateNamePhraseCount
} from "./corporate-name-phrases.js";
import {
  loadWikidataKanaPhrases,
  getWikidataKanaPhraseCount
} from "./wikidata-kana-phrases.js";
import {
  loadSudachiFullPhrases,
  getSudachiFullPhraseCount
} from "./sudachi-full-phrases.js";
import {
  loadJoyoJukujiPhrases,
  getJoyoJukujiPhraseCount
} from "./joyo-jukuji-phrases.js";
import {
  loadJaFuriganaPhrases,
  getJaFuriganaPhraseCount
} from "./ja-furigana-phrases.js";
import {
  loadPersonalNamePhrases,
  getPersonalNamePhraseCount,
  rebuildCombinedPhraseTrie
} from "./personal-name-phrases.js";
import { loadUnidicPhrases, getUnidicPhraseCount } from "./unidic-phrases.js";
import { loadKanjiReadings, getKanjiReadingCount } from "./kanji-readings.js";
import {
  loadEnglishKatakanaDict,
  getEnglishKatakanaDictCount
} from "./english-katakana-reading.js";
import { isRetryableDictFetchError } from "./dict-gzip-fetch.js";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   load: () => Promise<unknown>,
 *   count: () => number
 * }} PhraseDictSpec
 */

/** @type {{ core: PhraseDictSpec[], heavy: PhraseDictSpec[] }} */
export const PHRASE_DICT_TIERS = {
  // 字幕の初速用。kuromoji と並行ロードし、完了を待ってから初回ルビ。
  core: [
    {
      id: "joyo",
      label: "Joyo jukuji phrases",
      load: loadJoyoJukujiPhrases,
      count: getJoyoJukujiPhraseCount
    },
    {
      id: "ja-furigana",
      label: "ja-furigana phrases",
      load: loadJaFuriganaPhrases,
      count: getJaFuriganaPhraseCount
    },
    {
      id: "kanji",
      label: "Kanji readings",
      load: loadKanjiReadings,
      count: getKanjiReadingCount
    },
    {
      id: "personal",
      label: "Personal-name phrases",
      load: loadPersonalNamePhrases,
      count: getPersonalNamePhraseCount
    },
    {
      id: "station",
      label: "Station phrases",
      load: loadStationPhrases,
      count: getStationPhraseCount
    },
    {
      id: "english",
      label: "English katakana dict",
      load: loadEnglishKatakanaDict,
      count: getEnglishKatakanaDictCount
    }
  ],
  // gz 合計 ~46MB。既定では起動しない。明示 loadHeavyPhraseDictsSequentially のみ。
  heavy: [
    {
      id: "neologd",
      label: "NEologd phrases",
      load: loadNeologdPhrases,
      count: getNeologdPhraseCount
    },
    {
      id: "unidic",
      label: "UniDic phrases",
      load: loadUnidicPhrases,
      count: getUnidicPhraseCount
    },
    {
      id: "wikidata",
      label: "Wikidata kana phrases",
      load: loadWikidataKanaPhrases,
      count: getWikidataKanaPhraseCount
    },
    {
      id: "sudachi-full",
      label: "Sudachi Full phrases",
      load: loadSudachiFullPhrases,
      count: getSudachiFullPhraseCount
    },
    {
      id: "place",
      label: "Place-name phrases",
      load: loadPlaceNamePhrases,
      count: getPlaceNamePhraseCount
    },
    {
      id: "corporate",
      label: "Corporate-name phrases",
      load: loadCorporateNamePhrases,
      count: getCorporateNamePhraseCount
    }
  ]
};

export const CORE_PHRASE_DICT_IDS = PHRASE_DICT_TIERS.core.map((d) => d.id);
export const HEAVY_PHRASE_DICT_IDS = PHRASE_DICT_TIERS.heavy.map((d) => d.id);

function logReady(label, count) {
  console.log(`[YT Furigana] ${label} ready (${count})`);
}

function logSkip(label, error) {
  const msg = String(error?.message || error);
  // Failed to fetch / 拡張再読込は本体は動く。warn だと Chrome のエラー画面に残る
  if (isRetryableDictFetchError(error)) {
    console.debug(`[YT Furigana] ${label} skipped:`, msg);
    return;
  }
  console.warn(`[YT Furigana] ${label} skipped:`, msg);
}

/**
 * @param {PhraseDictSpec} spec
 */
async function loadOnePhraseDict(spec) {
  await spec.load();
  logReady(spec.label, spec.count());
}

/**
 * 小型辞書を順番にロード（失敗しても本体は動く）。完了後に結合 Trie を1回だけ作る。
 * 並行 fetch は kuromoji とぶつかって Failed to fetch になりやすい。
 * @returns {Promise<void>}
 */
export async function startCorePhraseDicts() {
  /** @type {PhraseDictSpec[]} */
  const skipped = [];
  for (const spec of PHRASE_DICT_TIERS.core) {
    try {
      await loadOnePhraseDict(spec);
    } catch (error) {
      logSkip(spec.label, error);
      if (isRetryableDictFetchError(error)) skipped.push(spec);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  for (const spec of skipped) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await loadOnePhraseDict(spec);
    } catch (error) {
      logSkip(spec.label, error);
    }
  }
  rebuildCombinedPhraseTrie();
}

/**
 * 大型辞書を1本ずつ。各本のあとにメインスレッドを譲り、最後に Trie を1回再構築。
 * @returns {Promise<void>}
 */
export async function loadHeavyPhraseDictsSequentially() {
  for (const spec of PHRASE_DICT_TIERS.heavy) {
    try {
      await loadOnePhraseDict(spec);
    } catch (error) {
      logSkip(spec.label, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  rebuildCombinedPhraseTrie();
}

/**
 * 大型辞書は既定で載せない。アイドル後でも YouTube が止まる。
 * 明示 loadHeavyPhraseDictsSequentially 呼び出し用にシグネチャだけ残す。
 * @param {() => void} [onAllReady]
 */
export function scheduleHeavyPhraseDicts(onAllReady) {
  void onAllReady;
}
