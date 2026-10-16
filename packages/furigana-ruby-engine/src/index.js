/**
 * furigana-ruby-engine: 日本語テキストにひらがなルビ（<ruby>）を付けるエンジン。
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
import { collectReadingCandidates } from "../../../src/reading-candidates.js";
import { applyUserReadingLearning } from "../../../src/user-reading-dict.js";
import { buildKuromojiTokenizer } from "./kuromoji-loader.js";
import {
  chunkLines,
  fetchReadingApiLines,
  resolveReadingApiOption,
  warmReadingApi
} from "./reading-api-client.js";

/** 読み API の結果を覚えておく行数（字幕 1 本分は十分入る） */
const API_CACHE_LIMIT = 2000;
const TIMED_OUT = Symbol("timed out");

/** 読み API の HTML は常に語ごとの span 付きなので、素の <ruby> が欲しいときは外す（本文はエスケープ済み） */
const unwrapWords = (html) => html.replace(/<span class="yt-furigana-word"[^>]*>|<\/span>/g, "");

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
      "furigana-ruby-engine: ブラウザでは dictionaryBaseUrl（dict/ を配信する URL）か loadFile を指定してください"
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
  const userReadings = { ...(options.userReadings || {}) };
  const readingApi = resolveReadingApiOption(options.readingApi);

  const toHtml = (text, opts = {}) =>
    buildFuriganaHtml(String(text ?? ""), tokenize, {
      wrapWords: opts.clickable === true,
      contextText: opts.contextText
    });

  // 行 → API の HTML（null は「API は読みなし」なので手元で描く）。失敗した行は覚えない
  const apiCache = new Map();
  // 行 → 問い合わせ中の結果（失敗時は undefined）
  const inflight = new Map();
  const remember = (line, html) => {
    apiCache.delete(line);
    apiCache.set(line, html);
    if (apiCache.size > API_CACHE_LIMIT) apiCache.delete(apiCache.keys().next().value);
  };
  const render = (line, html, opts) => {
    if (html == null) return toHtml(line, opts);
    return opts.clickable === true ? html : unwrapWords(html);
  };
  const request = (lines) => {
    const batch = fetchReadingApiLines(lines, readingApi, userReadings).then(
      (results) => {
        for (const [line, html] of results) remember(line, html);
        return results;
      },
      (error) => {
        if (options.debug === true) console.warn("[furigana-ruby-engine] reading API failed", error);
        return null;
      }
    );
    for (const line of lines) {
      const pending = batch.then((results) => (results ? results.get(line) : undefined));
      inflight.set(line, pending);
      pending.finally(() => {
        if (inflight.get(line) === pending) inflight.delete(line);
      });
    }
    return batch;
  };
  const needsApi = (line) =>
    hasKanji(line) && !apiCache.has(line) && !inflight.has(line);

  if (readingApi) warmReadingApi(readingApi);

  return {
    /**
     * ルビ付き HTML。既定は <ruby> だけの素の HTML（clickable: true で拡張と同じ語単位の span 付き）。
     * @param {string} text
     * @param {{ clickable?: boolean, contextText?: string }} [opts]
     */
    toHtml,
    /**
     * readingApi を指定していれば読み API で、なければ手元のエンジンでルビ HTML を作る。
     * API が失敗・時間切れのときは手元のエンジンの結果を返す。
     * @param {string} text
     * @param {{ clickable?: boolean, contextText?: string }} [opts]
     */
    async toHtmlAsync(text, opts = {}) {
      const line = String(text ?? "");
      if (!readingApi || !hasKanji(line)) return toHtml(line, opts);
      if (apiCache.has(line)) return render(line, apiCache.get(line), opts);
      if (!inflight.has(line)) request([line]);
      const pending = inflight.get(line);
      const waitMs = Number(opts.maxWaitMs);
      let timer;
      const result =
        Number.isFinite(waitMs) && waitMs >= 0
          ? await Promise.race([
              pending,
              new Promise((resolve) => {
                timer = setTimeout(() => resolve(TIMED_OUT), waitMs);
              })
            ])
          : await pending;
      clearTimeout(timer);
      // 間に合わない・失敗したときは手元の結果（問い合わせは続き、届いたら次から使う）
      if (result === TIMED_OUT || result === undefined) return toHtml(line, opts);
      return render(line, result, opts);
    },
    /**
     * 先に読み API へ問い合わせて結果を覚えておく（字幕の全行など）。数行ずつ 1 回にまとめる。
     * @param {string[]} texts
     */
    async prefetch(texts) {
      if (!readingApi) return;
      const lines = [...new Set((texts || []).map((t) => String(t ?? "")))].filter(needsApi);
      // 公開 API は 1 分あたりの回数に上限があるので、まとめた塊を順番に送る
      for (const chunk of chunkLines(lines)) await request(chunk);
    },
    /**
     * 語の読み候補（拡張の読み選択メニューと同じ。スコア順・最大 8 件）。
     * @param {string} surface
     * @param {{ currentReading?: string, contextText?: string }} [opts]
     * @returns {{ reading: string, source: string, label: string }[]}
     */
    candidates(surface, opts = {}) {
      return collectReadingCandidates(
        String(surface ?? ""),
        opts.currentReading || "",
        opts.contextText || "",
        userReadings
      );
    },
    /** kuromoji の形態素（surface_form / reading など） */
    tokenize,
    hasKanji
  };
}
