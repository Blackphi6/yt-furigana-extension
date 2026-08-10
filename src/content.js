import kuromoji from "kuromoji";
import {
  applyCaptionStyles,
  captureCaptionStyles,
  preferNativeStyledCaption,
  releaseCaptionStyles,
  releaseAllCaptionWindowStyles,
  startCaptionStyleGuard,
  scheduleCaptionViewportFit,
  looksLikeBrokenCaptionComputed,
  restoreYouTubeCaptionAppearance,
  ensureCaptionFontLock,
  ensureReleasedCaptionsReadable
} from "./caption-styles.js";
import {
  DEFAULT_SETTINGS,
  isReadingApiEngine,
  normalizeStoredEngine,
  shouldUseRemoteConversion
} from "./default-settings.js";
import { buildFuriganaHtml } from "./furigana.js";
import { insertCaptionSoftBreaks, maxLineCharsFromElement, estimateMaxLineChars } from "./caption-line-break.js";
import { wrapKeepOneLineHtml } from "./ruby-layout.js";
import { recordLearningSample } from "./learning-inbox.js";
import { installReadingPicker, installFuriganaHoverHighlight } from "./reading-picker.js";
import { installPlayerToggle } from "./player-toggle.js";
import {
  applyYouTubeFuriganaOverlay,
  blankYouTubeFuriganaOverlay,
  clearYouTubeFuriganaOverlays,
  restoreYouTubeNativeCaptionsVisible,
  setYouTubeNativeCaptionHidden,
  startYouTubeOverlayPositionLoop,
  stopYouTubeOverlayPositionLoop
} from "./youtube-caption-overlay.js";
import {
  applyReadingFloatsOverNative,
  captionHasPreexistingFurigana,
  clearReadingFloats,
  clearReadingFloatsInWindow,
  NATIVE_SKIP_ATTR
} from "./youtube-reading-floats.js";
import {
  applyUserReadingLearning,
  loadUserReadingStore
} from "./user-reading-dict.js";
import { loadOccurrenceOverrideStore } from "./occurrence-overrides.js";
import { createCaptionProcessScheduler } from "./caption-process-schedule.js";
import { shouldReplaceProvisionalFurigana } from "./reading-api-cache.js";
import {
  ORIGINAL_ATTR,
  PROCESSED_ATTR,
  PROCESSING_ATTR,
  plainTextWithoutRuby,
  prepareCaptionForLineFitCapture,
  flattenCaptionToPlainText,
  clearExtensionCaptionAttrs,
  hasExtensionCaptionMarkup,
  isCaptionExtensionStale
} from "./caption-teardown.js";
import {
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex,
  reloadBundledReadingMaps
} from "./reading-context.js";
import { initSudachiTokenizer } from "./sudachi-tokenizer.js";
import { showProgress, showSudachiProgress } from "./sudachi-progress-ui.js";
import { createHybridTokenize } from "./hybrid-tokenizer.js";
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
  loadPersonalNamePhrases,
  getPersonalNamePhraseCount,
  rebuildCombinedPhraseTrie
} from "./personal-name-phrases.js";
import {
  loadUnidicPhrases,
  getUnidicPhraseCount
} from "./unidic-phrases.js";
import {
  loadKanjiReadings,
  getKanjiReadingCount
} from "./kanji-readings.js";
import {
  loadEnglishKatakanaDict,
  getEnglishKatakanaDictCount
} from "./english-katakana-reading.js";
import {
  describeCaptionEnsureResult,
  ensureYouTubeJapaneseCaptions
} from "./youtube-enable-captions.js";

/** Store build: no timedtext module — video id from URL only. */
function getYouTubeVideoId(href = location.href) {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }

    // www / m / music.youtube.com
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const shorts = url.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/^\/embed\/([^/?]+)/);
      if (embed) return embed[1];
      const live = url.pathname.match(/^\/live\/([^/?]+)/);
      if (live) return live[1];
      return url.searchParams.get("v");
    }

    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v");
    }
  } catch {
    // ignore
  }
  return null;
}

function findActiveTimedCaptionCues() {
  return [];
}

/** Player captions only — transcript panel can have hundreds of nodes and freezes the page. */
const YOUTUBE_CAPTION_SELECTORS = [".ytp-caption-segment", ".caption-visual-line"];
/** TVer (Video.js / Streaks): colored cue text lives in direct child spans. */
const TVER_CAPTION_LINE_SELECTOR = ".vjs-text-track-cue-line";
const TVER_CAPTION_TEXT_SELECTOR = `${TVER_CAPTION_LINE_SELECTOR} > span`;
const TVER_CAPTION_SELECTORS = [TVER_CAPTION_TEXT_SELECTOR, TVER_CAPTION_LINE_SELECTOR];
const CAPTION_SELECTORS = [...YOUTUBE_CAPTION_SELECTORS, ...TVER_CAPTION_SELECTORS];

function isYouTubeHost() {
  return /(^|\.)youtube\.com$/i.test(location.hostname);
}

function isTVerHost() {
  return /(^|\.)tver\.jp$/i.test(location.hostname);
}

function getSiteVideoKey() {
  const youtubeId = getYouTubeVideoId();
  if (youtubeId) return `yt:${youtubeId}`;
  const episode = location.pathname.match(/\/episodes\/([a-z0-9]+)/i);
  if (episode) return `tver:${episode[1]}`;
  if (isTVerHost()) return `tver:${location.pathname}`;
  return location.href;
}

function getObserverRoot() {
  return (
    document.querySelector(".html5-video-player") ||
    document.querySelector(".vjs-text-track-display") ||
    document.querySelector(".video-js") ||
    document.querySelector("[class*='EpisodePlayer']") ||
    document.body
  );
}

let tokenizer = null;
let sudachiTokenize = null;
let hybridTokenize = null;
let initPromise = null;
let sudachiInitPromise = null;
let settings = { ...DEFAULT_SETTINGS };
let enabled = true;
let observer = null;
/** 自前 DOM 更新中の MutationObserver 再入防止 */
let observerPauseDepth = 0;
const CAPTION_OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  characterData: true
};
let currentVideoId = null;
let prefetchController = null;
let prefetchPromise = null;
/** @type {ReturnType<typeof createCaptionProcessScheduler> | null} */
let captionProcessScheduler = null;
/** TVer: 遅れて来る2行目用の再走査世代 */
let tverLateSweepGen = 0;
/** @type {import("./youtube-captions.js").TimedCaptionCue[]} */
let timedCues = [];
/**
 * 色替わり（karaoke / paint-on）字幕のときだけ true。
 * false の通常字幕は YouTube ネイティブにルビを差し込む。
 */
let youtubeOverlayMode = false;
const cache = new Map();
const inflight = new Map();

async function initTokenizer() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 固有名詞 Trie は解析器と並行ロード（失敗しても本体は動く）
    const neologdReady = loadNeologdPhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] NEologd phrases ready (${getNeologdPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn("[YT Furigana] NEologd phrases skipped:", error?.message || error);
      });

    const placeNameReady = loadPlaceNamePhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] Place-name phrases ready (${getPlaceNamePhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Place-name phrases skipped:",
          error?.message || error
        );
      });

    const stationReady = loadStationPhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] Station phrases ready (${getStationPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Station phrases skipped:",
          error?.message || error
        );
      });

    const corporateReady = loadCorporateNamePhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] Corporate-name phrases ready (${getCorporateNamePhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Corporate-name phrases skipped:",
          error?.message || error
        );
      });

    const wikidataReady = loadWikidataKanaPhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] Wikidata kana phrases ready (${getWikidataKanaPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Wikidata kana phrases skipped:",
          error?.message || error
        );
      });

    const sudachiFullReady = loadSudachiFullPhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] Sudachi Full phrases ready (${getSudachiFullPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Sudachi Full phrases skipped:",
          error?.message || error
        );
      });

    const unidicReady = loadUnidicPhrases()
      .then(() => {
        rebuildCombinedPhraseTrie();
        console.log(
          `[YT Furigana] UniDic phrases ready (${getUnidicPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn("[YT Furigana] UniDic phrases skipped:", error?.message || error);
      });

    const personalNameReady = loadPersonalNamePhrases()
      .then(() => {
        console.log(
          `[YT Furigana] Personal-name phrases ready (${getPersonalNamePhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] Personal-name phrases skipped:",
          error?.message || error
        );
      });

    const kanjiReady = loadKanjiReadings()
      .then(() => {
        console.log(
          `[YT Furigana] Kanji readings ready (${getKanjiReadingCount()})`
        );
      })
      .catch((error) => {
        console.warn("[YT Furigana] Kanji readings skipped:", error?.message || error);
      });


    const englishReady = loadEnglishKatakanaDict()
      .then(() => {
        console.log(
          `[YT Furigana] English katakana dict ready (${getEnglishKatakanaDictCount()})`
        );
      })
      .catch((error) => {
        console.warn(
          "[YT Furigana] English katakana dict skipped:",
          error?.message || error
        );
      });

    const dictReady = [
      neologdReady,
      placeNameReady,
      stationReady,
      corporateReady,
      wikidataReady,
      sudachiFullReady,
      unidicReady,
      personalNameReady,
      kanjiReady,
      englishReady
    ];
    void Promise.all(dictReady);
    const builtTokenizer = await new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: chrome.runtime.getURL("dict/") })
        .build((error, built) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(built);
        });
    });
    tokenizer = builtTokenizer;
    await Promise.all(dictReady);
    return builtTokenizer;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

async function initSudachi() {
  if (sudachiInitPromise) return sudachiInitPromise;
  sudachiInitPromise = initSudachiTokenizer({
    onProgress: (progress) => {
      showSudachiProgress(progress);
      if (progress.phase === "fetch" || progress.phase === "init") {
        console.log(`[YT Furigana] Sudachi ${progress.message}`);
      }
    }
  })
    .then((tokenize) => {
      sudachiTokenize = tokenize;
      console.log("[YT Furigana] Sudachi ready");
      return tokenize;
    })
    .catch((error) => {
      sudachiInitPromise = null;
      showSudachiProgress({
        phase: "error",
        percent: 0,
        message: `初期化失敗: ${error.message}`
      });
      throw error;
    });
  return sudachiInitPromise;
}

function rebuildHybridTokenize() {
  if (sudachiTokenize && tokenizer) {
    hybridTokenize = createHybridTokenize(sudachiTokenize, (text) =>
      tokenizer.tokenize(text)
    );
    return;
  }
  if (tokenizer) {
    // Progressive: use Kuromoji until Sudachi finishes loading.
    hybridTokenize = (text) => tokenizer.tokenize(text);
  }
}

function startSudachiInBackground() {
  if (sudachiTokenize || sudachiInitPromise) return;
  void initSudachi()
    .then(() => {
      rebuildHybridTokenize();
      clearCache();
      resetProcessedCaptions();
      scheduleProcess();
      console.log("[YT Furigana] Sudachi ready — switched hybrid tokenizer");
    })
    .catch((error) => {
      console.warn("[YT Furigana] Sudachi background init failed:", error.message);
    });
}

async function ensureLocalTokenizer() {
  if (settings.engine === "hybrid") {
    if (!tokenizer) await initTokenizer();
    rebuildHybridTokenize();
    startSudachiInBackground();
    return;
  }
  if (settings.engine === "sudachi") {
    if (!sudachiTokenize) await initSudachi();
    return;
  }
  if (!tokenizer) await initTokenizer();
}

async function convertWithLocalDictionary(text) {
  await ensureLocalTokenizer();
  if (settings.engine === "hybrid") {
    return buildFuriganaHtml(text, hybridTokenize);
  }
  if (settings.engine === "sudachi") {
    return buildFuriganaHtml(text, sudachiTokenize);
  }
  return buildFuriganaHtml(text, (value) => tokenizer.tokenize(value));
}

async function convertWithLocalFallback(text) {
  if (!tokenizer) await initTokenizer();
  rebuildHybridTokenize();
  startSudachiInBackground();
  if (hybridTokenize) {
    return buildFuriganaHtml(text, hybridTokenize);
  }
  return buildFuriganaHtml(text, (value) => tokenizer.tokenize(value));
}

function noteLearningSample(text, html) {
  const videoUrl =
    typeof location !== "undefined" && location.href ? location.href : "";
  void recordLearningSample(text, html, { videoUrl }).catch(() => {});
}

async function convertText(text) {
  const normalized = normalizeText(text);
  if (!shouldUseRemoteConversion(settings)) {
    const html = await convertWithLocalDictionary(normalized);
    noteLearningSample(normalized, html);
    return html;
  }

  try {
    const html = isReadingApiEngine(settings.engine)
      ? await fetchReadingApiHtml(normalized)
      : await fetchOllamaHtml(normalized);
    noteLearningSample(normalized, html);
    return html;
  } catch (error) {
    const message = error?.message || String(error);
    // 拡張の再読込直後は content が古いまま残ることがある
    if (!/Extension context invalidated/i.test(message)) {
      console.warn(
        "[YT Furigana] remote engine failed, falling back to local dictionary:",
        message
      );
    }
    const html = await convertWithLocalFallback(normalized);
    cache.set(getCacheKey(normalized), html);
    noteLearningSample(normalized, html);
    return html;
  }
}

function prefetchConcurrency() {
  return 1;
}

function cancelPrefetch() {
  if (prefetchController) {
    prefetchController.abort();
    prefetchController = null;
  }
  prefetchPromise = null;
}

/**
 * 通常字幕モードへ強制（オーバーレイ停止・ネイティブ再表示）。
 */
function useNativeYouTubeCaptions() {
  youtubeOverlayMode = false;
  timedCues = [];
  stopYouTubeOverlaySyncLoop();
  stopYouTubeOverlayPositionLoop();
  clearYouTubeFuriganaOverlays();
  restoreYouTubeNativeCaptionsVisible();
}

/**
 * 色替わり字幕 → オーバーレイ…は一旦無効。
 * ネイティブ非表示が全言語字幕を消す事故を起こしたため、
 * 当面は常に YouTube 標準＋ルビ差し込みのみ。
 * @param {boolean} [_enabledOverlay]
 */
function setYouTubeOverlayMode(_enabledOverlay) {
  useNativeYouTubeCaptions();
}

function maybeEnableOverlayFromLiveDom() {
  // 当面オーバーレイ自動切替なし
}

async function startCaptionPrefetch(_reason = "manual") {
  // Store-safe: never hit timedtext / caption-prefetch. DOM conversion only.
  scheduleProcess();
  return null;
}

function handleVideoNavigation() {
  const videoKey = getSiteVideoKey();
  if (!videoKey || videoKey === currentVideoId) return;
  currentVideoId = videoKey;
  clearCache();
  timedCues = [];
  useNativeYouTubeCaptions();
  scheduleEnsureJapaneseCaptions("navigate");
  scheduleProcess();
}

/** 動画ごとに日本語字幕オンを数回まで試す（timedtext は使わない） */
const CAPTION_ENSURE_MAX_ATTEMPTS = 4;
/** 広告待ちは「試行」に数えない。プリロールが長いと本編前に諦めてしまうため */
const CAPTION_ENSURE_MAX_AD_WAITS = 60;
const CAPTION_ENSURE_AD_WAIT_MS = 2500;

let captionEnsureVideoKey = null;
let captionEnsureTimer = 0;
let captionEnsureAttempts = 0;
let captionEnsureAdWaits = 0;

function scheduleEnsureJapaneseCaptions(reason = "") {
  if (!enabled || !isYouTubeHost()) return;

  const key = getSiteVideoKey();
  if (key !== captionEnsureVideoKey) {
    captionEnsureVideoKey = key;
    captionEnsureAttempts = 0;
    captionEnsureAdWaits = 0;
  }

  const waitingForAd = reason === "retry-after-ad";
  if (!waitingForAd && captionEnsureAttempts >= CAPTION_ENSURE_MAX_ATTEMPTS) return;
  if (waitingForAd && captionEnsureAdWaits >= CAPTION_ENSURE_MAX_AD_WAITS) return;

  if (captionEnsureTimer) {
    clearTimeout(captionEnsureTimer);
    captionEnsureTimer = 0;
  }

  const delayMs = waitingForAd ? CAPTION_ENSURE_AD_WAIT_MS : 1200;
  captionEnsureTimer = window.setTimeout(() => {
    captionEnsureTimer = 0;

    const player =
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");
    const result = ensureYouTubeJapaneseCaptions(player);

    // 広告中は本編の字幕トラックが出ないので、試行回数を消費せずに待つ
    if (!result.ok && result.reason === "ad-playing") {
      captionEnsureAdWaits += 1;
      scheduleEnsureJapaneseCaptions("retry-after-ad");
      return;
    }

    captionEnsureAttempts += 1;

    // 配信不能・トラック無しだけユーザーに知らせる（成功時は黙ってルビ処理へ）
    const message = describeCaptionEnsureResult(result);
    if (
      message &&
      (result.reason === "japanese-unservable" || result.reason === "no-japanese-track")
    ) {
      showProgress({ phase: "ready", percent: 100, message }, "YT Furigana");
    }

    if (result.ok) {
      scheduleProcess();
      return;
    }

    // 本編開始直後はプレイヤー API がまだ揃っていないことがある
    if (
      captionEnsureAttempts < CAPTION_ENSURE_MAX_ATTEMPTS &&
      (result.reason === "no-player-api" || result.reason === "tracklist-unavailable")
    ) {
      scheduleEnsureJapaneseCaptions("retry");
    }
  }, delayMs);
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const engine = normalizeStoredEngine(result.engine);
  if (engine !== result.engine) {
    await chrome.storage.sync.set({ engine });
  }
  settings = { ...result, engine };
  enabled = result.enabled;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getCaptionSourceText(element) {
  const saved = element.getAttribute(ORIGINAL_ATTR);
  if (saved != null && saved !== "") {
    // If YouTube replaced the caption with plain text, refresh the saved original.
    if (!element.querySelector("rt, ruby")) {
      const plain = plainTextWithoutRuby(element);
      if (plain && plain !== saved) {
        element.setAttribute(ORIGINAL_ATTR, plain);
        return plain;
      }
    }
    return saved;
  }
  return plainTextWithoutRuby(element);
}

function getProcessingKey(normalized) {
  return `${settings.engine}:${settings.ollamaModel}:${settings.readingApiUrl}:${normalized}`;
}

function getCacheKey(normalized) {
  return getProcessingKey(normalized);
}

async function convertWithKuromoji(text) {
  return convertWithLocalDictionary(text);
}

function requestBackgroundHtml(type, text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, text }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.html);
    });
  });
}

function requestLlmFurigana(text) {
  return requestBackgroundHtml("CONVERT_FURIGANA", text);
}

function requestReadingApiFurigana(text) {
  return requestBackgroundHtml("CONVERT_READING_API", text);
}

function ensureOriginalText(element, normalized) {
  const prev = element.getAttribute(ORIGINAL_ATTR);
  if (prev === normalized) return;
  element.setAttribute(ORIGINAL_ATTR, normalized);
  // キュー本文が変わったら1行判定・幅基準を捨てて再計測させる
  element.removeAttribute("data-yt-furigana-keep-one-line");
  element.removeAttribute("data-yt-furigana-line-width");
  element.removeAttribute("data-yt-furigana-needed-width");
}

function maxLineCharsForYouTubeOverlay(element) {
  const player =
    element?.closest?.(".html5-video-player") ||
    document.querySelector(".html5-video-player");
  const playerW =
    player instanceof HTMLElement ? player.getBoundingClientRect().width : 0;
  const fontPx =
    (element instanceof HTMLElement &&
      Number.parseFloat(getComputedStyle(element).fontSize)) ||
    32;
  if (playerW > 0) {
    // オーバーレイはプレイヤー幅の約 90%。狭い caption-window 基準だと早割れする
    return estimateMaxLineChars({
      lineWidthPx: playerW * 0.88,
      fontSizePx: Math.max(fontPx, 28)
    });
  }
  return maxLineCharsFromElement(element);
}

function escapeCaptionPlainHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 表示中の全 .ytp-caption-segment を1つのオーバーレイにまとめる。
 * （1行ずつ上書きすると2行字幕の1行目が消える）
 * @param {HTMLElement} anchorSegment
 */
function syncYouTubeOverlayFromLiveCaptions(anchorSegment) {
  const segments = findCaptionElements(document);
  if (segments.length === 0) return;

  const maxLineChars = maxLineCharsForYouTubeOverlay(anchorSegment);
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const keys = [];

  for (const el of segments) {
    const text = getCaptionSourceText(el);
    if (!text) continue;
    const cacheKey = getCacheKey(text);
    keys.push(cacheKey);

    const cached = cache.get(cacheKey);
    if (cached) {
      lines.push(insertCaptionSoftBreaks(cached, { maxLineChars }));
      continue;
    }
    if (el.querySelector("ruby, rt")) {
      lines.push(el.innerHTML);
      continue;
    }
    // 未変換でも行は残す（後でキャッシュが埋まれば差し替え）
    lines.push(escapeCaptionPlainHtml(text));
  }

  if (lines.length === 0) return;

  const combined = lines
    .map((html) => `<div class="yt-furigana-yt-overlay-line">${html}</div>`)
    .join("");
  const textKey = keys.join("\n");
  applyYouTubeFuriganaOverlay(anchorSegment, combined, textKey);
  startYouTubeOverlayPositionLoop();
}

function getYouTubePlayerVideo() {
  return (
    document.querySelector(".html5-video-player video.html5-main-video") ||
    document.querySelector(".html5-video-player video") ||
    document.querySelector("video.html5-main-video")
  );
}

function getYouTubeOverlayAnchor() {
  const segments = findCaptionElements(document);
  if (segments[0] instanceof HTMLElement) return segments[0];
  const player = document.querySelector(".html5-video-player");
  return player instanceof HTMLElement ? player : null;
}

/**
 * timedtext の時刻付きキューでオーバーレイを同期する。
 * 色替わり字幕モード専用。
 * @returns {boolean} timed キューで処理したか
 */
function syncYouTubeOverlayFromTimedCues() {
  if (!youtubeOverlayMode) return false;
  if (timedCues.length === 0) return false;
  const video = getYouTubePlayerVideo();
  if (!(video instanceof HTMLVideoElement)) return false;

  const nowMs = Math.floor((video.currentTime || 0) * 1000);
  const active = findActiveTimedCaptionCues(timedCues, nowMs);
  const anchor = getYouTubeOverlayAnchor();
  if (!(anchor instanceof HTMLElement)) return true;

  if (active.length === 0) {
    // timed に該当が無くても、YouTube DOM に字幕があればそれを表示
    const segments = findCaptionElements(document);
    if (segments.length > 0) {
      syncYouTubeOverlayFromLiveCaptions(segments[0]);
      return true;
    }
    blankYouTubeFuriganaOverlay();
    return true;
  }

  const maxLineChars = maxLineCharsForYouTubeOverlay(anchor);
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const keys = [];

  for (const cue of active) {
    const text = normalizeText(cue.text);
    if (!text) continue;
    keys.push(`${cue.startMs}:${text}`);
    const cached = cache.get(getCacheKey(text));
    if (cached) {
      lines.push(insertCaptionSoftBreaks(cached, { maxLineChars }));
    } else {
      lines.push(escapeCaptionPlainHtml(text));
      void convertText(text)
        .then((html) => {
          cache.set(getCacheKey(text), html);
        })
        .catch(() => {
          /* ignore */
        });
    }
  }

  if (lines.length === 0) {
    blankYouTubeFuriganaOverlay();
    return true;
  }

  const combined = lines
    .map((html) => `<div class="yt-furigana-yt-overlay-line">${html}</div>`)
    .join("");
  applyYouTubeFuriganaOverlay(anchor, combined, keys.join("\n"));
  startYouTubeOverlayPositionLoop();
  return true;
}

// 色替わり字幕モード専用の定期同期
let youtubeOverlaySyncTimer = null;
function startYouTubeOverlaySyncLoop() {
  if (!isYouTubeHost() || !youtubeOverlayMode || youtubeOverlaySyncTimer != null) {
    return;
  }
  youtubeOverlaySyncTimer = window.setInterval(() => {
    if (!enabled || !youtubeOverlayMode) return;
    if (syncYouTubeOverlayFromTimedCues()) return;
    const segments = findCaptionElements(document);
    if (segments.length === 0) return;
    syncYouTubeOverlayFromLiveCaptions(segments[0]);
  }, 100);
}

function stopYouTubeOverlaySyncLoop() {
  if (youtubeOverlaySyncTimer != null) {
    window.clearInterval(youtubeOverlaySyncTimer);
    youtubeOverlaySyncTimer = null;
  }
}

function applyFuriganaHtml(element, html, processingKey) {
  if (!enabled) return;
  // あらかじめふりがなが載っている字幕は一切触らない
  if (leavePreexistingFuriganaAlone(element)) return;
  withCaptionObserverPaused(() => {
    // teardown 残骸（黒文字・帯なし）は先に直してから通常ルビへ
    if (isYouTubeHost() && looksLikeBrokenCaptionComputed(element)) {
      clearReadingFloats(element);
      restoreYouTubeCaptionAppearance(element);
    }

    // 色追従・縁取り・明朝などの「デザイン字幕」は本文を触らず読みだけ浮かせる
    if (isYouTubeHost() && preferNativeStyledCaption(element)) {
      clearYouTubeFuriganaOverlays();
      // visual-line と segment の二重適用を避ける（segment 優先）
      if (
        element.matches(".caption-visual-line") &&
        element.querySelector(".ytp-caption-segment")
      ) {
        element.setAttribute(PROCESSED_ATTR, processingKey);
        return;
      }
      // OFF 時の字号復元用（float は captureCaptionStyles を通らない）
      ensureCaptionFontLock(element);
      applyReadingFloatsOverNative(element, html);
      element.setAttribute(PROCESSED_ATTR, processingKey);
      return;
    }

    // 通常: YouTube / TVer 標準字幕へルビを差し込む
    clearReadingFloats(element);
    if (!(isYouTubeHost() && youtubeOverlayMode)) {
      prepareCaptionForLineFitCapture(element);
      captureCaptionStyles(element);
      const keepOneLine =
        element.getAttribute("data-yt-furigana-keep-one-line") === "1";
      const withBreaks = keepOneLine
        ? html
        : insertCaptionSoftBreaks(html, {
            maxLineChars: maxLineCharsFromElement(element)
          });
      element.innerHTML = keepOneLine
        ? wrapKeepOneLineHtml(withBreaks)
        : withBreaks;
      applyCaptionStyles(element);
      startCaptionStyleGuard(element);
      element.setAttribute(PROCESSED_ATTR, processingKey);
      return;
    }

    // レガシー色替わりオーバーレイ（現行は無効化済み経路）
    prepareCaptionForLineFitCapture(element);
    captureCaptionStyles(element);
    const keepOneLine =
      element.getAttribute("data-yt-furigana-keep-one-line") === "1";
    const broken = keepOneLine
      ? wrapKeepOneLineHtml(html)
      : insertCaptionSoftBreaks(html, {
          maxLineChars: maxLineCharsForYouTubeOverlay(element)
        });
    element.innerHTML = broken;
    applyCaptionStyles(element);
    startCaptionStyleGuard(element);
    if (timedCues.length > 0) {
      syncYouTubeOverlayFromTimedCues();
    } else {
      syncYouTubeOverlayFromLiveCaptions(element);
    }
    element.setAttribute(PROCESSED_ATTR, processingKey);
  });
}

async function fetchRemoteHtml(normalized, requestFn) {
  const cacheKey = getCacheKey(normalized);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let promise = inflight.get(cacheKey);
  if (!promise) {
    promise = requestFn(normalized)
      .then((html) => {
        cache.set(cacheKey, html);
        inflight.delete(cacheKey);
        return html;
      })
      .catch((error) => {
        inflight.delete(cacheKey);
        throw error;
      });
    inflight.set(cacheKey, promise);
  }

  return promise;
}

async function fetchOllamaHtml(normalized) {
  return fetchRemoteHtml(normalized, requestLlmFurigana);
}

async function fetchReadingApiHtml(normalized) {
  return fetchRemoteHtml(normalized, requestReadingApiFurigana);
}

/**
 * 変換結果を「今画面にある」同一テキストの字幕へ適用する。
 * カラオケは変換中に DOM が差し替わるため、開始時の element だけ見てはいけない。
 */
function applyFuriganaToLiveCaptions(normalized, html, processingKey) {
  if (!enabled) return;
  const targetKey = getCacheKey(normalized);
  for (const el of findCaptionElements(document)) {
    const text = getCaptionSourceText(el);
    if (!text || getCacheKey(text) !== targetKey) continue;
    ensureOriginalText(el, text);
    if (el.getAttribute(PROCESSED_ATTR) === processingKey) {
      if (!isCaptionExtensionStale(el)) continue;
      releaseCaptionStyles(el);
      el.removeAttribute(PROCESSED_ATTR);
    }
    applyFuriganaHtml(el, html, processingKey);
  }
}

/** ローカル変換を cacheKey 単位で重複排除し、成功したら必ず cache に載せる。 */
async function convertLocalAndCache(normalized) {
  const cacheKey = getCacheKey(normalized);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let promise = inflight.get(cacheKey);
  if (!promise) {
    promise = convertWithLocalDictionary(normalized)
      .then((html) => {
        cache.set(cacheKey, html);
        noteLearningSample(normalized, html);
        inflight.delete(cacheKey);
        return html;
      })
      .catch((error) => {
        inflight.delete(cacheKey);
        throw error;
      });
    inflight.set(cacheKey, promise);
  }
  return promise;
}

async function applyRemoteFurigana(normalized, processingKey) {
  const cacheKey = getCacheKey(normalized);
  if (cache.has(cacheKey)) {
    applyFuriganaToLiveCaptions(normalized, cache.get(cacheKey), processingKey);
    return;
  }

  // API とローカルを並行。短い猶予内に API（ディスクキャッシュ含む）が返れば
  // 仮の「まるひし」などを出さず、正しい読みだけを載せる。
  const remotePromise = convertText(normalized).then((html) => {
    if (html) cache.set(cacheKey, html);
    return html;
  });
  const localPromise = convertWithLocalDictionary(normalized).catch(() => "");
  const waitMs = 150;
  const early = await Promise.race([
    remotePromise.then((html) => ({ kind: "remote", html })),
    new Promise((resolve) => {
      setTimeout(() => resolve({ kind: "wait" }), waitMs);
    })
  ]);

  let provisionalHtml = "";
  if (early.kind === "remote") {
    if (!enabled) return;
    if (early.html) {
      applyFuriganaToLiveCaptions(normalized, early.html, processingKey);
    }
    return;
  }

  // 猶予超過: 端末内を仮表示（API 遅延・コールドスタート時）
  try {
    provisionalHtml = await localPromise;
    if (cache.has(cacheKey)) {
      if (enabled) {
        applyFuriganaToLiveCaptions(normalized, cache.get(cacheKey), processingKey);
      }
      return;
    }
    if (enabled && provisionalHtml) {
      applyFuriganaToLiveCaptions(normalized, provisionalHtml, processingKey);
    }
  } catch {
    /* 楽観表示に失敗しても API 待ちへ */
  }

  try {
    const html = await remotePromise;
    if (!enabled) return;
    if (shouldReplaceProvisionalFurigana(provisionalHtml, html)) {
      applyFuriganaToLiveCaptions(normalized, html, processingKey);
    } else if (!provisionalHtml && html) {
      applyFuriganaToLiveCaptions(normalized, html, processingKey);
    }
  } catch (error) {
    console.warn("[YT Furigana] conversion failed:", error.message);
    if (enabled && provisionalHtml && !cache.has(cacheKey)) {
      cache.set(cacheKey, provisionalHtml);
    }
  }
}

/**
 * 動画側であらかじめふりがなが振られている字幕は、拡張未導入時と同じ見た目を保つ。
 * @param {HTMLElement} element
 * @returns {boolean} スキップしたか
 */
function leavePreexistingFuriganaAlone(element) {
  if (!(element instanceof HTMLElement)) return false;
  // 以前スキップした印があっても、差し替えでプレーンになっていれば再判定する
  if (element.getAttribute(NATIVE_SKIP_ATTR) === "1") {
    element.removeAttribute(NATIVE_SKIP_ATTR);
  }
  if (!captionHasPreexistingFurigana(element)) return false;
  element.setAttribute(NATIVE_SKIP_ATTR, "1");
  return true;
}

async function processElement(element) {
  if (!enabled) return;
  if (leavePreexistingFuriganaAlone(element)) return;

  const normalized = getCaptionSourceText(element);
  if (!normalized) return;

  ensureOriginalText(element, normalized);

  const processingKey = getProcessingKey(normalized);
  // シーク等で YouTube が子を差し替え、フラグだけ残っているときは再適用
  if (element.getAttribute(PROCESSED_ATTR) === processingKey) {
    if (!isCaptionExtensionStale(element)) return;
    releaseCaptionStyles(element);
    element.removeAttribute(PROCESSED_ATTR);
  }

  // カラオケ字幕は DOM が頻繁に作り直されるので、キャッシュがあれば即適用
  const cacheKey = getCacheKey(normalized);
  if (cache.has(cacheKey)) {
    applyFuriganaHtml(element, cache.get(cacheKey), processingKey);
    return;
  }

  if (shouldUseRemoteConversion(settings)) {
    captureCaptionStyles(element);
    void applyRemoteFurigana(normalized, processingKey);
    return;
  }

  // ノード単位の PROCESSING_ATTR は差し替えで無効になるため、inflight Map で重複排除
  try {
    const html = await convertLocalAndCache(normalized);
    if (!enabled) return;
    applyFuriganaToLiveCaptions(normalized, html, processingKey);
  } catch (error) {
    console.error("[YT Furigana] conversion failed:", error);
  }
}

async function processCaptions(root = document) {
  if (!enabled) return;

  maybeEnableOverlayFromLiveDom();
  const elements = findCaptionElements(root);
  for (const element of elements) {
    await processElement(element);
  }
  // 2行字幕: 全行ルビ適用後に行間を再計測（先行行の fit が2行目ルビ前に走っても取りこぼさない）
  if (isTVerHost() && elements.length > 0) {
    const display =
      elements[0]?.closest?.(".vjs-text-track-display") ||
      document.querySelector(".vjs-text-track-display");
    if (display instanceof HTMLElement) scheduleCaptionViewportFit(display);
  }
}

function scheduleTVerLateLineSweep() {
  if (!isTVerHost()) return;
  const gen = ++tverLateSweepGen;
  // 1行目処理後に2行目 cue が遅延追加されるケースを拾う
  for (const ms of [120, 280, 500]) {
    window.setTimeout(() => {
      if (!enabled || gen !== tverLateSweepGen) return;
      void processCaptions(document);
    }, ms);
  }
}

function scheduleProcess(_root = document) {
  if (!captionProcessScheduler) {
    captionProcessScheduler = createCaptionProcessScheduler(
      (root) => processCaptions(/** @type {Document} */ (root)),
      { delayMs: 80, broadRoot: document }
    );
  }
  captionProcessScheduler.scheduleProcess(_root);
  scheduleTVerLateLineSweep();
}

function isCaptionElement(node) {
  if (!(node instanceof HTMLElement)) return false;
  // 自前オーバーレイ（Stylus 用に ytp-caption-segment クラスを持つ）は処理対象外
  if (
    node.classList.contains("yt-furigana-yt-overlay") ||
    node.closest("#yt-furigana-yt-overlay-root")
  ) {
    return false;
  }
  if (YOUTUBE_CAPTION_SELECTORS.some((selector) => node.matches(selector))) {
    return true;
  }
  if (node.matches(TVER_CAPTION_TEXT_SELECTOR)) return !node.closest("ruby");
  if (!node.matches(TVER_CAPTION_LINE_SELECTOR)) return false;
  // Prefer direct text spans when Video.js provides them. Fall back to the
  // line node for cue lines that contain bare text or non-span wrappers.
  return !Array.from(node.children).some(
    (child) => child instanceof HTMLElement && child.tagName === "SPAN"
  );
}

/**
 * キャッシュ済みなら debounce せず即ルビ化（MV カラオケの高速上書き対策）。
 * @param {ParentNode|Element|null|undefined} root
 * @returns {boolean} 変換待ちが残っていなければ true（スケジュール不要）
 */
function tryApplyCachedFurigana(root) {
  if (!enabled || !root) return false;
  /** @type {HTMLElement[]} */
  const targets = [];
  if (root instanceof HTMLElement && isCaptionElement(root)) {
    targets.push(root);
  }
  if (root && typeof root.querySelectorAll === "function") {
    for (const node of root.querySelectorAll(
      ".ytp-caption-segment, .caption-visual-line, .vjs-text-track-cue-line > span, .vjs-text-track-cue-line"
    )) {
      if (node instanceof HTMLElement && isCaptionElement(node)) targets.push(node);
    }
  }

  let handled = false;
  let pending = false;
  // segment があれば line は触らない（二重ルビ／帯崩れ防止）
  const preferSegments = targets.some((t) =>
    t.classList?.contains("ytp-caption-segment")
  );
  for (const target of targets) {
    if (
      preferSegments &&
      target.classList?.contains("caption-visual-line") &&
      target.querySelector(".ytp-caption-segment")
    ) {
      continue;
    }
    if (leavePreexistingFuriganaAlone(target)) {
      handled = true;
      continue;
    }
    const normalized = getCaptionSourceText(target);
    if (!normalized) continue;
    const cacheKey = getCacheKey(normalized);
    const processingKey = getProcessingKey(normalized);
    if (target.getAttribute(PROCESSED_ATTR) === processingKey) {
      if (!isCaptionExtensionStale(target)) {
        handled = true;
        continue;
      }
      releaseCaptionStyles(target);
      target.removeAttribute(PROCESSED_ATTR);
    }
    if (!cache.has(cacheKey)) {
      // 1行目だけキャッシュ命中しても、2行目が未変換なら再スケジュールが必要
      pending = true;
      continue;
    }
    applyFuriganaHtml(target, cache.get(cacheKey), processingKey);
    handled = true;
  }
  return handled && !pending;
}

function nodeMayContainCaptions(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (isCaptionElement(node)) return true;
  return CAPTION_SELECTORS.some((selector) => Boolean(node.querySelector(selector)));
}

function queryCaptionScope(root, selector) {
  const elements = [];
  if (root instanceof HTMLElement && root.matches(selector)) {
    elements.push(root);
  }
  if (root && typeof root.querySelectorAll === "function") {
    elements.push(...root.querySelectorAll(selector));
  }
  return elements;
}

function findCaptionElements(root = document) {
  const isDocumentRoot = root instanceof Document || root === document.body;

  const youtubeScope = isDocumentRoot
    ? document.querySelector(".html5-video-player") || root
    : root;

  // visual-line と segment の両方を処理すると、line 側の innerHTML 差し替えで
  // segment の Background（Window 0% 時の文字帯）が消える。
  const segments = queryCaptionScope(youtubeScope, ".ytp-caption-segment").filter(
    (el) =>
      el instanceof HTMLElement &&
      !el.classList.contains("yt-furigana-yt-overlay") &&
      !el.closest("#yt-furigana-yt-overlay-root")
  );
  if (segments.length > 0) return segments;

  const youtubeLines = queryCaptionScope(youtubeScope, ".caption-visual-line");
  if (youtubeLines.length > 0) return youtubeLines;

  const tverScope = isDocumentRoot
    ? document.querySelector(".vjs-text-track-display") ||
      document.querySelector(".video-js") ||
      root
    : root;

  const tverTargets = [];
  for (const line of queryCaptionScope(tverScope, TVER_CAPTION_LINE_SELECTOR)) {
    if (!(line instanceof HTMLElement)) continue;
    const directSpans = Array.from(line.children).filter(
      (child) => child instanceof HTMLElement && child.tagName === "SPAN"
    );
    if (directSpans.length > 0) {
      tverTargets.push(...directSpans);
    } else {
      tverTargets.push(line);
    }
  }

  return tverTargets.filter((el) => el instanceof HTMLElement && !el.closest("ruby"));
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!enabled || observerPauseDepth > 0) return;

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent?.closest("rt, rp")) continue;
        const caption = parent?.closest?.(CAPTION_SELECTORS.join(",")) || parent;
        if (!(caption && isCaptionElement(caption))) continue;

        // 自前ルビ適用直後の text ノード変異は無視。本文が変わった／消えたときだけ再適用
        if (hasExtensionCaptionMarkup(caption) && !isCaptionExtensionStale(caption)) {
          const plain = plainTextWithoutRuby(caption);
          const orig = caption.getAttribute(ORIGINAL_ATTR);
          if (orig && plain === orig) continue;
        }
        handleCaptionDomWipe(caption);
        continue;
      }

      if (mutation.type === "childList") {
        const parent = mutation.target;
        // 同一セグメント内で ruby だけ消された／差し替えられた場合
        if (
          parent instanceof HTMLElement &&
          isCaptionElement(parent) &&
          isCaptionExtensionStale(parent)
        ) {
          handleCaptionDomWipe(parent);
        } else if (parent instanceof HTMLElement && isCaptionElement(parent)) {
          const removedExtensionMarkup = Array.from(mutation.removedNodes).some(
            (node) => {
              if (!(node instanceof HTMLElement)) return false;
              if (
                node.matches?.(
                  "ruby, rt, .yt-furigana-one-line, [data-yt-furigana-float-host], .yt-furigana-float-host"
                )
              ) {
                return true;
              }
              return hasExtensionCaptionMarkup(node);
            }
          );
          if (removedExtensionMarkup && !hasExtensionCaptionMarkup(parent)) {
            handleCaptionDomWipe(parent);
          }
        }

        for (const node of mutation.addedNodes) {
          if (nodeMayContainCaptions(node)) {
            if (!tryApplyCachedFurigana(node)) {
              scheduleProcess(node);
            }
          }
        }
      }
    }
  });

  observer.observe(getObserverRoot(), CAPTION_OBSERVER_OPTIONS);
}

/**
 * 自前の innerHTML / textContent 更新中は observer を止め、
 * ON→OFF→ON での「適用 → 消滅検知 → 再適用」無限ループを防ぐ。
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function withCaptionObserverPaused(fn) {
  if (!observer) return fn();
  if (observerPauseDepth === 0) observer.disconnect();
  observerPauseDepth += 1;
  try {
    return fn();
  } finally {
    observerPauseDepth = Math.max(0, observerPauseDepth - 1);
    if (observerPauseDepth === 0 && observer) {
      observer.observe(getObserverRoot(), CAPTION_OBSERVER_OPTIONS);
    }
  }
}

/**
 * YouTube がルビ DOM を消したあとにスタイル残骸を捨てて再適用する。
 * @param {HTMLElement} caption
 */
function handleCaptionDomWipe(caption) {
  let appliedFromCache = false;
  withCaptionObserverPaused(() => {
    releaseCaptionStyles(caption);
    caption.removeAttribute(PROCESSED_ATTR);
    const plain = plainTextWithoutRuby(caption);
    if (plain) {
      caption.setAttribute(ORIGINAL_ATTR, plain);
      if (hasExtensionCaptionMarkup(caption)) {
        caption.textContent = plain;
      }
    }
    // キャッシュ命中なら pause 中に即適用（再入しない）
    appliedFromCache = tryApplyCachedFurigana(caption);
  });
  if (!appliedFromCache) {
    scheduleProcess(caption);
  }
}

function restoreOriginalText() {
  captionProcessScheduler?.cancel?.();
  stopYouTubeOverlaySyncLoop();
  stopYouTubeOverlayPositionLoop();
  clearYouTubeFuriganaOverlays();
  youtubeOverlayMode = false;
  timedCues = [];
  restoreYouTubeNativeCaptionsVisible();
  withCaptionObserverPaused(() => {
    for (const element of collectTeardownCaptionElements()) {
      // 既存ルビ字幕は未導入時と同じ状態のまま残す（flatten しない）
      if (
        element.getAttribute(NATIVE_SKIP_ATTR) === "1" ||
        captionHasPreexistingFurigana(element)
      ) {
        element.removeAttribute(NATIVE_SKIP_ATTR);
        continue;
      }
      clearReadingFloatsInWindow(element);
      clearReadingFloats(element);
      releaseCaptionStyles(element);
      flattenCaptionToPlainText(element);
      clearExtensionCaptionAttrs(element);
    }
    // セグメント解放後に窓 style を一括復元＋ visual-line の誤 font-size を除去
    releaseAllCaptionWindowStyles();
    // OFF 直後に 11px 継承のまま残っていたら即フォールバック
    ensureReleasedCaptionsReadable();
  });
}

function resetProcessedCaptions() {
  withCaptionObserverPaused(() => {
    for (const element of collectTeardownCaptionElements()) {
      // 既存ルビ字幕はエンジン切替でも触らない
      if (
        element.getAttribute(NATIVE_SKIP_ATTR) === "1" ||
        captionHasPreexistingFurigana(element)
      ) {
        element.removeAttribute(NATIVE_SKIP_ATTR);
        continue;
      }
      clearReadingFloats(element);
      releaseCaptionStyles(element);
      const original = element.getAttribute(ORIGINAL_ATTR);
      if (original != null) {
        element.textContent = original;
      } else if (hasExtensionCaptionMarkup(element)) {
        flattenCaptionToPlainText(element);
      }
      element.removeAttribute(PROCESSED_ATTR);
      element.removeAttribute(PROCESSING_ATTR);
      element.removeAttribute("data-yt-furigana-float-mode");
      element.removeAttribute("data-yt-furigana-keep-one-line");
      element.removeAttribute("data-yt-furigana-line-width");
      element.removeAttribute("data-yt-furigana-needed-width");
      element.removeAttribute("data-yt-furigana-styled");
      element.removeAttribute("data-yt-furigana-font-size");
      element.removeAttribute(NATIVE_SKIP_ATTR);
    }
    releaseAllCaptionWindowStyles();
  });
}

/**
 * OFF/再適用で style を触ってよい字幕ノード。
 * segment があるのに visual-line まで release すると display:block が消え 2 行が壊れる。
 * @returns {HTMLElement[]}
 */
function collectTeardownCaptionElements() {
  /** @type {HTMLElement[]} */
  const out = [];
  const ytSegments = document.querySelectorAll(".ytp-caption-segment");
  if (ytSegments.length > 0) {
    for (const el of ytSegments) {
      if (el instanceof HTMLElement) out.push(el);
    }
  } else {
    for (const el of document.querySelectorAll(".caption-visual-line")) {
      if (el instanceof HTMLElement) out.push(el);
    }
  }
  for (const selector of TVER_CAPTION_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (el instanceof HTMLElement) out.push(el);
    }
  }
  return out;
}

function clearCache() {
  cache.clear();
  inflight.clear();
}

async function applySettings() {
  await loadSettings();
  cancelPrefetch();
  clearCache();
  timedCues = [];
  setYouTubeOverlayMode(false);
  chrome.runtime.sendMessage({ type: "CLEAR_LLM_CACHE" });

  if (!enabled) {
    restoreOriginalText();
    return;
  }

  // 通常はネイティブ表示。色替わり判定後に overlay へ切替
  if (isYouTubeHost()) {
    restoreYouTubeNativeCaptionsVisible();
    scheduleEnsureJapaneseCaptions("settings");
  }

  // OFF 残骸を消してから再適用（二重ルビ・3行化防止）
  resetProcessedCaptions();

  if (
    settings.engine === "kuromoji" ||
    settings.engine === "sudachi" ||
    settings.engine === "hybrid"
  ) {
    await ensureLocalTokenizer();
  } else if (settings.engine === "reading-api" && shouldUseRemoteConversion(settings)) {
    await ensureLocalTokenizer().catch(() => {});
    try {
      chrome.runtime.sendMessage({ type: "WARM_READING_API" }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* ignore */
    }
  }

  scheduleProcess();
  currentVideoId = getSiteVideoKey();
}

/** @type {{ syncToggleUi: (enabled: boolean) => void } | null } */
let playerToggleApi = null;

async function setEnabled(value) {
  const next = Boolean(value);
  enabled = next;
  settings.enabled = next;
  try {
    // ポップアップのオンオフと同じ storage キーを共有
    await chrome.storage.sync.set({ enabled: next });
  } catch {
    // storage 失敗時もローカル適用は続ける
  }
  await applySettings();
  playerToggleApi?.syncToggleUi(enabled);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    const shouldRefresh =
      changes.enabled ||
      changes.engine ||
      changes.ollamaUrl ||
      changes.ollamaModel ||
      changes.readingApiUrl ||
      changes.sharedPackEnabled;

    if (changes.sharedPackEnabled || shouldRefresh) {
      void (async () => {
        await loadSettings();
        if (changes.sharedPackEnabled) {
          await reapplyAllReadingLearning();
        }
        if (shouldRefresh) await applySettings();
        if (changes.enabled) {
          playerToggleApi?.syncToggleUi(Boolean(settings.enabled));
        }
      })();
    }
    return;
  }

  if (area === "local" && (changes.freeSharedReadingPack || changes.premiumSharedReadingDict)) {
    void reapplyAllReadingLearning();
  }
});

async function reapplyAllReadingLearning() {
  reloadBundledReadingMaps();
  try {
    if (settings.sharedPackEnabled !== false) {
      const stored = await chrome.storage.local.get({
        freeSharedReadingPack: {},
        // migrate old key once
        sharedReadingDict: {}
      });
      const free =
        stored.freeSharedReadingPack && typeof stored.freeSharedReadingPack === "object"
          ? stored.freeSharedReadingPack
          : {};
      const legacy =
        stored.sharedReadingDict && typeof stored.sharedReadingDict === "object"
          ? stored.sharedReadingDict
          : {};
      applyUserReadingLearning(
        MANUAL_PHRASE_READINGS,
        CONTEXT_READING_RULES,
        rebuildManualPhraseIndex,
        Object.keys(free).length ? free : legacy
      );
    }
    const premiumStore = await chrome.storage.local.get({ premiumSharedReadingDict: {} });
    const premium =
      premiumStore.premiumSharedReadingDict &&
      typeof premiumStore.premiumSharedReadingDict === "object"
        ? premiumStore.premiumSharedReadingDict
        : {};
    if (Object.keys(premium).length) {
      applyUserReadingLearning(
        MANUAL_PHRASE_READINGS,
        CONTEXT_READING_RULES,
        rebuildManualPhraseIndex,
        premium
      );
    }
  } catch {
    // ignore
  }
  const userStore = await loadUserReadingStore();
  applyUserReadingLearning(
    MANUAL_PHRASE_READINGS,
    CONTEXT_READING_RULES,
    rebuildManualPhraseIndex,
    userStore
  );
}

function startVideoNavigationWatch() {
  const onNavigate = () => {
    // Player may remount after SPA navigation.
    startObserver();
    handleVideoNavigation();
  };

  document.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("yt-navigate-finish", onNavigate);

  let lastHref = location.href;
  window.setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    onNavigate();
  }, 2000);
}

async function bootstrap() {
  await loadSettings();
  await loadOccurrenceOverrideStore();
  await reapplyAllReadingLearning();

  installReadingPicker(document);
  installFuriganaHoverHighlight(document);
  if (isTVerHost()) {
    window.addEventListener(
      "resize",
      () => {
        const display = document.querySelector(".vjs-text-track-display");
        if (display instanceof HTMLElement) scheduleCaptionViewportFit(display);
      },
      { passive: true }
    );
  }
  if (isYouTubeHost()) {
    window.addEventListener(
      "resize",
      () => {
        const win =
          document.querySelector(".caption-window") ||
          document.querySelector(".ytp-caption-window-container");
        if (win instanceof HTMLElement) scheduleCaptionViewportFit(win);
      },
      { passive: true }
    );
  }
  if (isYouTubeHost()) {
    // page bridge（timedtext）は通常再生では不要。429 で本体字幕も潰すので入れない。
    useNativeYouTubeCaptions();
    scheduleEnsureJapaneseCaptions("bootstrap");
  }
  startObserver();
  startVideoNavigationWatch();

  playerToggleApi = installPlayerToggle({
    getEnabled: () => Boolean(enabled),
    setEnabled
  });
  playerToggleApi.syncToggleUi(Boolean(enabled));

  // エンジンによらず辞書側を常に準備 → 読みAPI併用でも固有名詞／英語読みを守る
  void loadNeologdPhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] NEologd phrases ready (${getNeologdPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn("[YT Furigana] NEologd phrases skipped:", error?.message || error);
    });
  void loadPlaceNamePhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] Place-name phrases ready (${getPlaceNamePhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Place-name phrases skipped:",
        error?.message || error
      );
    });
  void loadStationPhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] Station phrases ready (${getStationPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Station phrases skipped:",
        error?.message || error
      );
    });
  void loadCorporateNamePhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] Corporate-name phrases ready (${getCorporateNamePhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Corporate-name phrases skipped:",
        error?.message || error
      );
    });
  void loadWikidataKanaPhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] Wikidata kana phrases ready (${getWikidataKanaPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Wikidata kana phrases skipped:",
        error?.message || error
      );
    });
  void loadSudachiFullPhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] Sudachi Full phrases ready (${getSudachiFullPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Sudachi Full phrases skipped:",
        error?.message || error
      );
    });
  void loadUnidicPhrases()
    .then(() => {
      rebuildCombinedPhraseTrie();
      console.log(
        `[YT Furigana] UniDic phrases ready (${getUnidicPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn("[YT Furigana] UniDic phrases skipped:", error?.message || error);
    });
  void loadPersonalNamePhrases()
    .then(() => {
      console.log(
        `[YT Furigana] Personal-name phrases ready (${getPersonalNamePhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] Personal-name phrases skipped:",
        error?.message || error
      );
    });
  void loadKanjiReadings()
    .then(() => {
      console.log(
        `[YT Furigana] Kanji readings ready (${getKanjiReadingCount()})`
      );
    })
    .catch((error) => {
      console.warn("[YT Furigana] Kanji readings skipped:", error?.message || error);
    });
  void loadEnglishKatakanaDict()
    .then(() => {
      console.log(
        `[YT Furigana] English katakana dict ready (${getEnglishKatakanaDictCount()})`
      );
    })
    .catch((error) => {
      console.warn(
        "[YT Furigana] English katakana dict skipped:",
        error?.message || error
      );
    });

  if (enabled) {
    const useLocal =
      settings.engine === "kuromoji" ||
      settings.engine === "sudachi" ||
      settings.engine === "hybrid" ||
      (settings.engine === "reading-api" &&
        !shouldUseRemoteConversion(settings));
    if (useLocal) {
      await ensureLocalTokenizer();
    } else if (settings.engine === "reading-api") {
      // 楽観表示用に端末内辞書を先に暖機し、並行で公開 API も起こす
      await ensureLocalTokenizer().catch(() => {});
      try {
        chrome.runtime.sendMessage({ type: "WARM_READING_API" }, () => {
          void chrome.runtime.lastError;
        });
      } catch {
        /* ignore */
      }
    }
    scheduleProcess();
    currentVideoId = getSiteVideoKey();
  }
}

void bootstrap();
