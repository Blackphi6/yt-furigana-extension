/**
 * yt-furigana-engine: 日本語テキストにひらがなルビ（<ruby>）を付けるエンジン。
 * ブラウザ（拡張・Web ページ）と Node の両方で動く。chrome.* には依存しない。
 */
import { buildFuriganaHtml, hasKanji } from "../../../src/furigana.js";
import { setDictionaryFileLoader } from "../../../src/dict-gzip-fetch.js";
import { setPhraseDictReadyLog, startCorePhraseDicts } from "../../../src/phrase-dict-boot.js";
import {
  CONTEXT_READING_RULES,
  MANUAL_PHRASE_READINGS,
  rebuildManualPhraseIndex
} from "../../../src/reading-context.js";
import { applyUserReadingLearning } from "../../../src/user-reading-dict.js";
import { buildKuromojiTokenizer } from "./kuromoji-loader.js";

/**
 * 既定の読み込み: dictionaryBaseUrl があれば fetch、Node ならパッケージ同梱の dict/ を fs で読む。
 * @param {string | URL | undefined} baseUrl
 */
function defaultLoadFile(baseUrl) {
  if (baseUrl) {
    const base = String(baseUrl).endsWith("/") ? String(baseUrl) : `${baseUrl}/`;
    return async (fileName) => {
      const res = await fetch(new URL(fileName, base));
      if (!res.ok) throw new Error(`dictionary ${fileName}: HTTP ${res.status}`);
      return res.arrayBuffer();
    };
  }
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (!isNode) {
    throw new Error(
      "yt-furigana-engine: ブラウザでは dictionaryBaseUrl（dict/ を配信する URL）か loadFile を指定してください"
    );
  }
  const dictDir = new URL("../dict/", import.meta.url);
  return async (fileName) => {
    const { readFile } = await import("node:fs/promises");
    return readFile(new URL(fileName, dictDir));
  };
}

/**
 * @param {{
 *   dictionaryBaseUrl?: string | URL,
 *   loadFile?: (fileName: string) => Promise<ArrayBuffer | Uint8Array>,
 *   phraseDictionaries?: boolean,
 *   userReadings?: Record<string, string>,
 *   debug?: boolean
 * }} [options]
 */
export async function createFuriganaEngine(options = {}) {
  const loadFile = options.loadFile || defaultLoadFile(options.dictionaryBaseUrl);
  // 固有名詞・熟字訓などの句辞書も同じ読み込み口を通す
  setDictionaryFileLoader(loadFile);
  setPhraseDictReadyLog(options.debug === true);
  const tokenizer = await buildKuromojiTokenizer(loadFile);
  if (options.phraseDictionaries !== false) await startCorePhraseDicts();
  if (options.userReadings && typeof options.userReadings === "object") {
    applyUserReadingLearning(
      MANUAL_PHRASE_READINGS,
      CONTEXT_READING_RULES,
      rebuildManualPhraseIndex,
      { phrases: { ...options.userReadings } }
    );
  }
  const tokenize = (text) => tokenizer.tokenize(String(text ?? ""));

  return {
    /**
     * ルビ付き HTML。既定は <ruby> だけの素の HTML（clickable: true で拡張と同じ語単位の span 付き）。
     * @param {string} text
     * @param {{ clickable?: boolean, contextText?: string }} [opts]
     */
    toHtml(text, opts = {}) {
      return buildFuriganaHtml(String(text ?? ""), tokenize, {
        wrapWords: opts.clickable === true,
        contextText: opts.contextText
      });
    },
    /** kuromoji の形態素（surface_form / reading など） */
    tokenize,
    hasKanji
  };
}
