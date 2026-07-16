import kuromoji from "kuromoji";
import {
  applyCaptionStyles,
  captureCaptionStyles,
  releaseCaptionStyles,
  startCaptionStyleGuard
} from "./caption-styles.js";
import {
  injectPageCaptionBridge,
  prefetchCaptionFurigana
} from "./caption-prefetch.js";
import {
  DEFAULT_SETTINGS,
  isReadingApiEngine,
  isRemoteEngine
} from "./default-settings.js";
import { buildFuriganaHtml } from "./furigana.js";
import { insertCaptionSoftBreaks, maxLineCharsFromElement } from "./caption-line-break.js";
import { recordLearningSample } from "./learning-inbox.js";
import { installReadingPicker } from "./reading-picker.js";
import {
  applyUserReadingLearning,
  loadUserReadingStore
} from "./user-reading-dict.js";
import {
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex
} from "./reading-context.js";
import { initSudachiTokenizer } from "./sudachi-tokenizer.js";
import { showProgress, showSudachiProgress } from "./sudachi-progress-ui.js";
import { createHybridTokenize } from "./hybrid-tokenizer.js";
import { loadNeologdPhrases, getNeologdPhraseCount } from "./neologd-phrases.js";
import {
  loadEnglishKatakanaDict,
  getEnglishKatakanaDictCount
} from "./english-katakana-reading.js";
import { getYouTubeVideoId } from "./youtube-captions.js";

const PROCESSED_ATTR = "data-yt-furigana-done";
const PROCESSING_ATTR = "data-yt-furigana-processing";
const ORIGINAL_ATTR = "data-yt-furigana-original";
/** Player captions only — transcript panel can have hundreds of nodes and freezes the page. */
const YOUTUBE_CAPTION_SELECTORS = [".ytp-caption-segment", ".caption-visual-line"];
/** TVer (Video.js / Streaks): colored cue text lives in direct child spans. */
const TVER_CAPTION_SELECTOR = ".vjs-text-track-cue-line > span";
const CAPTION_SELECTORS = [...YOUTUBE_CAPTION_SELECTORS, TVER_CAPTION_SELECTOR];

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
let currentVideoId = null;
let prefetchController = null;
let prefetchPromise = null;
let processTimer = null;
const cache = new Map();
const inflight = new Map();

async function initTokenizer() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 固有名詞 Trie は解析器と並行ロード（失敗しても本体は動く）
    const neologdReady = loadNeologdPhrases()
      .then(() => {
        console.log(
          `[YT Furigana] NEologd phrases ready (${getNeologdPhraseCount()})`
        );
      })
      .catch((error) => {
        console.warn("[YT Furigana] NEologd phrases skipped:", error?.message || error);
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
    await Promise.all([neologdReady, englishReady]);
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
  if (!isRemoteEngine(settings.engine)) {
    const html = await convertWithLocalDictionary(normalized);
    noteLearningSample(normalized, html);
    return html;
  }

  // 読みAPIなのに URL 未設定 → 警告を出さずローカルへ
  if (isReadingApiEngine(settings.engine) && !String(settings.readingApiUrl || "").trim()) {
    const html = await convertWithLocalFallback(normalized);
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
    console.warn(
      "[YT Furigana] remote engine failed, falling back to local dictionary:",
      error.message
    );
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

async function startCaptionPrefetch(reason = "manual") {
  if (!enabled) return null;
  // Local engines are fast enough on visible captions; full-track prefetch freezes YouTube.
  // Remote engines benefit from prefetching the whole timedtext track once.
  if (!isRemoteEngine(settings.engine)) return null;

  const videoId = getYouTubeVideoId();
  if (!videoId) return null;

  cancelPrefetch();
  const controller = new AbortController();
  prefetchController = controller;

  const run = (async () => {
    try {
      if (!tokenizer) await initTokenizer();
      rebuildHybridTokenize();
      startSudachiInBackground();

      const result = await prefetchCaptionFurigana({
        videoId,
        normalize: normalizeText,
        convert: convertText,
        cacheHas: (line) => cache.has(getCacheKey(line)),
        cacheSet: (line, html) => cache.set(getCacheKey(line), html),
        concurrency: prefetchConcurrency(),
        signal: controller.signal,
        onProgress: (progress) => {
          showProgress(progress, "YT Furigana · 字幕プリフェッチ");
        }
      });

      console.log(
        `[YT Furigana] prefetch ${reason}: ${result.lines.length} lines` +
          ` (converted=${result.converted}, source=${result.source})`
      );
      scheduleProcess();
      return result;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      console.warn("[YT Furigana] prefetch failed:", error.message);
      showProgress(
        {
          phase: "ready",
          percent: 100,
          message: "一括取得できず、表示時に処理します"
        },
        "YT Furigana · 字幕プリフェッチ"
      );
      return null;
    } finally {
      if (prefetchController === controller) {
        prefetchController = null;
        prefetchPromise = null;
      }
    }
  })();

  prefetchPromise = run;
  return run;
}

function handleVideoNavigation() {
  const videoKey = getSiteVideoKey();
  if (!videoKey || videoKey === currentVideoId) return;
  currentVideoId = videoKey;
  clearCache();
  if (isYouTubeHost()) {
    void startCaptionPrefetch("navigate");
  }
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = result;
  enabled = result.enabled;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** textContent of ruby includes <rt>, which must never be sent to converters. */
function plainTextWithoutRuby(element) {
  if (!(element instanceof HTMLElement)) {
    return normalizeText(String(element?.textContent ?? ""));
  }
  const clone = element.cloneNode(true);
  clone.querySelectorAll("rt, rp").forEach((node) => node.remove());
  return normalizeText(clone.textContent ?? "");
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
  if (!element.hasAttribute(ORIGINAL_ATTR)) {
    element.setAttribute(ORIGINAL_ATTR, normalized);
  }
}

function applyFuriganaHtml(element, html, processingKey) {
  // 必ずルビ化「前」にフォントと背景を固定する
  captureCaptionStyles(element);
  // ルビ HTML 確定後に BudouX 句境界へ ZWSP（字幕幅の目安文字数付近のみ）
  const maxLineChars = maxLineCharsFromElement(element);
  element.innerHTML = insertCaptionSoftBreaks(html, { maxLineChars });
  applyCaptionStyles(element);
  startCaptionStyleGuard(element);
  element.setAttribute(PROCESSED_ATTR, processingKey);
}

function isStillCurrentCaption(element, normalized) {
  return element.getAttribute(ORIGINAL_ATTR) === normalized;
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

async function applyRemoteFurigana(element, normalized, processingKey) {
  if (element.getAttribute(PROCESSING_ATTR) === processingKey) return;
  element.setAttribute(PROCESSING_ATTR, processingKey);

  try {
    const html = await convertText(normalized);
    if (!isStillCurrentCaption(element, normalized)) return;

    applyFuriganaHtml(element, html, processingKey);
  } catch (error) {
    console.warn("[YT Furigana] conversion failed:", error.message);
    if (isStillCurrentCaption(element, normalized)) {
      element.textContent = normalized;
      element.removeAttribute(PROCESSED_ATTR);
    }
  } finally {
    if (element.getAttribute(PROCESSING_ATTR) === processingKey) {
      element.removeAttribute(PROCESSING_ATTR);
    }
  }
}

async function processElement(element) {
  if (!enabled) return;

  const normalized = getCaptionSourceText(element);
  if (!normalized) return;

  ensureOriginalText(element, normalized);

  const processingKey = getProcessingKey(normalized);
  if (element.getAttribute(PROCESSED_ATTR) === processingKey) return;

  if (isRemoteEngine(settings.engine)) {
    const cacheKey = getCacheKey(normalized);
    if (cache.has(cacheKey)) {
      applyFuriganaHtml(element, cache.get(cacheKey), processingKey);
      return;
    }

    captureCaptionStyles(element);
    void applyRemoteFurigana(element, normalized, processingKey);
    return;
  }

  if (element.hasAttribute(PROCESSING_ATTR)) return;
  element.setAttribute(PROCESSING_ATTR, "1");

  try {
    const html = await convertWithLocalDictionary(normalized);
    if (!isStillCurrentCaption(element, normalized)) return;

    applyFuriganaHtml(element, html, processingKey);
    cache.set(getCacheKey(normalized), html);
    noteLearningSample(normalized, html);
  } catch (error) {
    console.error("[YT Furigana] conversion failed:", error);
  } finally {
    element.removeAttribute(PROCESSING_ATTR);
  }
}

async function processCaptions(root = document) {
  if (!enabled) return;

  const elements = findCaptionElements(root);
  for (const element of elements) {
    await processElement(element);
  }
}

function scheduleProcess(root = document) {
  if (processTimer != null) return;
  processTimer = window.setTimeout(() => {
    processTimer = null;
    void processCaptions(root instanceof Document ? document : root);
  }, 80);
}

function isCaptionElement(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (YOUTUBE_CAPTION_SELECTORS.some((selector) => node.matches(selector))) {
    return true;
  }
  // Avoid matching nested spans inside <ruby> after furigana injection.
  return (
    node.matches(TVER_CAPTION_SELECTOR) ||
    (node.tagName === "SPAN" &&
      node.parentElement?.classList?.contains("vjs-text-track-cue-line"))
  );
}

function nodeMayContainCaptions(node) {
  if (!(node instanceof HTMLElement)) return false;
  if (isCaptionElement(node)) return true;
  return CAPTION_SELECTORS.some((selector) => Boolean(node.querySelector(selector)));
}

function findCaptionElements(root = document) {
  const isDocumentRoot = root instanceof Document || root === document.body;

  const youtubeScope = isDocumentRoot
    ? document.querySelector(".html5-video-player") || root
    : root;

  // visual-line と segment の両方を処理すると、line 側の innerHTML 差し替えで
  // segment の Background（Window 0% 時の文字帯）が消える。
  const segments = Array.from(youtubeScope.querySelectorAll(".ytp-caption-segment"));
  if (segments.length > 0) return segments;

  const youtubeLines = Array.from(
    youtubeScope.querySelectorAll(".caption-visual-line")
  );
  if (youtubeLines.length > 0) return youtubeLines;

  const tverScope = isDocumentRoot
    ? document.querySelector(".vjs-text-track-display") ||
      document.querySelector(".video-js") ||
      root
    : root;

  return Array.from(tverScope.querySelectorAll(TVER_CAPTION_SELECTOR)).filter(
    (el) => el instanceof HTMLElement && !el.closest("ruby")
  );
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent?.closest("rt, rp")) continue;
        const caption = parent?.closest?.(CAPTION_SELECTORS.join(",")) || parent;
        if (caption && isCaptionElement(caption)) {
          releaseCaptionStyles(caption);
          caption.removeAttribute(PROCESSED_ATTR);
          caption.removeAttribute(ORIGINAL_ATTR);
          scheduleProcess(caption);
        }
        continue;
      }

      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (nodeMayContainCaptions(node)) {
            scheduleProcess(node);
          }
        }
      }
    }
  });

  observer.observe(getObserverRoot(), {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function restoreOriginalText() {
  CAPTION_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      releaseCaptionStyles(element);
      const original = element.getAttribute(ORIGINAL_ATTR);
      if (original != null) {
        element.textContent = original;
      }
      element.removeAttribute(ORIGINAL_ATTR);
      element.removeAttribute(PROCESSED_ATTR);
      element.removeAttribute(PROCESSING_ATTR);
    });
  });
}

function resetProcessedCaptions() {
  CAPTION_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      const original = element.getAttribute(ORIGINAL_ATTR);
      if (original != null) {
        element.textContent = original;
      }
      element.removeAttribute(PROCESSED_ATTR);
      element.removeAttribute(PROCESSING_ATTR);
    });
  });
}

function clearCache() {
  cache.clear();
  inflight.clear();
}

async function applySettings() {
  await loadSettings();
  cancelPrefetch();
  clearCache();
  chrome.runtime.sendMessage({ type: "CLEAR_LLM_CACHE" });

  if (!enabled) {
    restoreOriginalText();
    return;
  }

  resetProcessedCaptions();

  if (
    settings.engine === "kuromoji" ||
    settings.engine === "sudachi" ||
    settings.engine === "hybrid"
  ) {
    await ensureLocalTokenizer();
  }

  scheduleProcess();
  currentVideoId = getSiteVideoKey();
  if (isYouTubeHost()) {
    void startCaptionPrefetch("settings");
  }
}

async function setEnabled(value) {
  enabled = value;
  settings.enabled = value;
  await applySettings();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;

  const shouldRefresh =
    changes.enabled ||
    changes.engine ||
    changes.ollamaUrl ||
    changes.ollamaModel ||
    changes.readingApiUrl;

  if (shouldRefresh) {
    void applySettings();
  }
});

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
  const userStore = await loadUserReadingStore();
  applyUserReadingLearning(
    MANUAL_PHRASE_READINGS,
    CONTEXT_READING_RULES,
    rebuildManualPhraseIndex,
    userStore
  );

  // Premium 共有辞書（検証後に popup から取得して local に保存済みのもの）
  try {
    const stored = await chrome.storage.local.get({ sharedReadingDict: {} });
    const shared =
      stored.sharedReadingDict && typeof stored.sharedReadingDict === "object"
        ? stored.sharedReadingDict
        : {};
    applyUserReadingLearning(
      MANUAL_PHRASE_READINGS,
      CONTEXT_READING_RULES,
      rebuildManualPhraseIndex,
      shared
    );
  } catch {
    // ignore
  }

  installReadingPicker(document);
  if (isYouTubeHost()) {
    injectPageCaptionBridge();
  }
  startObserver();
  startVideoNavigationWatch();

  // エンジンによらず辞書側を常に準備 → 読みAPI併用でも固有名詞／英語読みを守る
  void loadNeologdPhrases()
    .then(() => {
      console.log(
        `[YT Furigana] NEologd phrases ready (${getNeologdPhraseCount()})`
      );
    })
    .catch((error) => {
      console.warn("[YT Furigana] NEologd phrases skipped:", error?.message || error);
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
    if (
      settings.engine === "kuromoji" ||
      settings.engine === "sudachi" ||
      settings.engine === "hybrid" ||
      settings.engine === "reading-api"
    ) {
      // reading-api でもフォールバック用にローカル解析器を暖機（失敗は無視）
      if (settings.engine !== "reading-api") {
        await ensureLocalTokenizer();
      } else {
        void ensureLocalTokenizer().catch(() => {});
      }
    }
    scheduleProcess();
    currentVideoId = getSiteVideoKey();
    if (isYouTubeHost()) {
      void startCaptionPrefetch("bootstrap");
    }
  }
}

void bootstrap();
