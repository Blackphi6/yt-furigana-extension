import kuromoji from "kuromoji";
import {
  applyCaptionStyles,
  captureCaptionStyles,
  releaseCaptionStyles,
  startCaptionStyleGuard
} from "./caption-styles.js";
import { DEFAULT_SETTINGS } from "./default-settings.js";
import { buildFuriganaHtml } from "./furigana.js";

const PROCESSED_ATTR = "data-yt-furigana-done";
const PROCESSING_ATTR = "data-yt-furigana-processing";
const ORIGINAL_ATTR = "data-yt-furigana-original";
const CAPTION_SELECTORS = [
  ".ytp-caption-segment",
  ".caption-visual-line",
  "ytd-transcript-segment-renderer .segment-text"
];

let tokenizer = null;
let initPromise = null;
let settings = { ...DEFAULT_SETTINGS };
let enabled = true;
let observer = null;
const cache = new Map();
const inflight = new Map();
const pending = new Set();

async function initTokenizer() {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: chrome.runtime.getURL("dict/") })
      .build((error, builtTokenizer) => {
        if (error) {
          reject(error);
          return;
        }
        tokenizer = builtTokenizer;
        resolve(builtTokenizer);
      });
  });

  return initPromise;
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = result;
  enabled = result.enabled;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getProcessingKey(normalized) {
  return `${settings.engine}:${settings.ollamaModel}:${normalized}`;
}

function getCacheKey(normalized) {
  return getProcessingKey(normalized);
}

async function convertWithKuromoji(text) {
  await initTokenizer();
  return buildFuriganaHtml(text, (value) => tokenizer.tokenize(value));
}

function requestLlmFurigana(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "CONVERT_FURIGANA", text }, (response) => {
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

function ensureOriginalText(element, normalized) {
  if (!element.hasAttribute(ORIGINAL_ATTR)) {
    element.setAttribute(ORIGINAL_ATTR, normalized);
  }
}

function applyFuriganaHtml(element, html, processingKey) {
  captureCaptionStyles(element);
  element.innerHTML = html;
  applyCaptionStyles(element);
  startCaptionStyleGuard(element);
  element.setAttribute(PROCESSED_ATTR, processingKey);
}

function isStillCurrentCaption(element, normalized) {
  return element.getAttribute(ORIGINAL_ATTR) === normalized;
}

async function fetchOllamaHtml(normalized) {
  const cacheKey = getCacheKey(normalized);
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let promise = inflight.get(cacheKey);
  if (!promise) {
    promise = requestLlmFurigana(normalized)
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

async function applyOllamaFurigana(element, normalized, processingKey) {
  if (element.getAttribute(PROCESSING_ATTR) === processingKey) return;
  element.setAttribute(PROCESSING_ATTR, processingKey);

  try {
    const html = await fetchOllamaHtml(normalized);
    if (!isStillCurrentCaption(element, normalized)) return;

    applyFuriganaHtml(element, html, processingKey);
  } catch (error) {
    console.warn("[YT Furigana] Ollama failed:", error.message);
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

  const rawText = element.textContent ?? "";
  const normalized = normalizeText(rawText);
  if (!normalized) return;

  ensureOriginalText(element, normalized);

  const processingKey = getProcessingKey(normalized);
  if (element.getAttribute(PROCESSED_ATTR) === processingKey) return;

  if (settings.engine === "ollama") {
    const cacheKey = getCacheKey(normalized);
    if (cache.has(cacheKey)) {
      applyFuriganaHtml(element, cache.get(cacheKey), processingKey);
      return;
    }

    captureCaptionStyles(element);
    void applyOllamaFurigana(element, normalized, processingKey);
    return;
  }

  if (element.hasAttribute(PROCESSING_ATTR)) return;
  element.setAttribute(PROCESSING_ATTR, "1");

  try {
    const html = await convertWithKuromoji(normalized);
    if (!isStillCurrentCaption(element, normalized)) return;

    applyFuriganaHtml(element, html, processingKey);
    cache.set(getCacheKey(normalized), html);
  } catch (error) {
    console.error("[YT Furigana] conversion failed:", error);
  } finally {
    element.removeAttribute(PROCESSING_ATTR);
  }
}

async function processCaptions(root = document) {
  if (!enabled) return;

  const elements = findCaptionElements(root);
  await Promise.all(elements.map((element) => processElement(element)));
}

function scheduleProcess(root) {
  const key = root === document ? "document" : root;
  if (pending.has(key)) return;
  pending.add(key);

  queueMicrotask(async () => {
    pending.delete(key);
    await processCaptions(root instanceof Document ? document : root);
  });
}

function isCaptionElement(node) {
  if (!(node instanceof HTMLElement)) return false;
  return CAPTION_SELECTORS.some((selector) => node.matches(selector));
}

function findCaptionElements(root = document) {
  return CAPTION_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector))
  );
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!enabled) return;

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const parent = mutation.target.parentElement;
        if (parent && isCaptionElement(parent)) {
          releaseCaptionStyles(parent);
          parent.removeAttribute(PROCESSED_ATTR);
          scheduleProcess(parent);
        }
        continue;
      }

      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            scheduleProcess(node);
          }
        });
      }
    }
  });

  observer.observe(document.body, {
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
  clearCache();
  chrome.runtime.sendMessage({ type: "CLEAR_LLM_CACHE" });

  if (!enabled) {
    restoreOriginalText();
    return;
  }

  resetProcessedCaptions();

  if (settings.engine === "kuromoji") {
    await initTokenizer();
  }

  scheduleProcess(document);
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
    changes.ollamaModel;

  if (shouldRefresh) {
    void applySettings();
  }
});

async function bootstrap() {
  await loadSettings();
  startObserver();

  if (enabled) {
    if (settings.engine === "kuromoji") {
      await initTokenizer();
    }
    scheduleProcess(document);
  }
}

void bootstrap();
