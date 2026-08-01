/**
 * YouTube ライブチャット iframe 内の Super Chat にふりがなを付ける。
 * timedtext / Innertube は使わない。
 * 読み未登録の漢字はクリックで手動登録できる。
 */

import kuromoji from "kuromoji";
import { buildFuriganaHtml, hasKanji } from "../../../src/furigana.js";
import {
  installFuriganaHoverHighlight,
  installReadingPicker
} from "../../../src/reading-picker.js";
import {
  CONTEXT_READING_RULES,
  MANUAL_PHRASE_READINGS,
  rebuildManualPhraseIndex,
  reloadBundledReadingMaps
} from "../../../src/reading-context.js";
import {
  USER_READING_DICT_KEY,
  applyUserReadingLearning,
  loadUserReadingStore
} from "../../../src/user-reading-dict.js";
import { loadNeologdPhrases } from "../../../src/neologd-phrases.js";
import {
  loadPersonalNamePhrases,
  rebuildCombinedPhraseTrie
} from "../../../src/personal-name-phrases.js";
import {
  applyFuriganaToMessage,
  collectSuperChatMessageElements,
  extractPlainMessage,
  isAlreadyProcessed,
  needsFurigana,
  restoreAllMessages
} from "./process.js";

const STORAGE_KEY = "ytscfState";
const CACHE_MAX = 400;

/** @type {{ enabled: boolean }} */
let state = { enabled: true };

/** @type {((text: string) => any[]) | null} */
let tokenize = null;

/** @type {Promise<void> | null} */
let tokenizerPromise = null;

/** @type {Map<string, string>} */
const htmlCache = new Map();

let processedCount = 0;
let moTimer = 0;
let scanQueued = false;
let learningReady = false;

function setStatus(partial) {
  try {
    chrome.storage.local.set({
      ytscfRuntime: {
        ready: Boolean(tokenize),
        processedCount,
        enabled: state.enabled,
        href: location.href,
        ...partial
      }
    });
  } catch {
    /* ignore */
  }
}

function clearHtmlCache() {
  htmlCache.clear();
}

/**
 * ユーザー登録読みをランタイム辞書へ載せる。
 */
async function reapplyUserReadings() {
  reloadBundledReadingMaps();
  const userStore = await loadUserReadingStore();
  applyUserReadingLearning(
    MANUAL_PHRASE_READINGS,
    CONTEXT_READING_RULES,
    rebuildManualPhraseIndex,
    userStore
  );
  learningReady = true;
  clearHtmlCache();
}

/**
 * 人名・NEologd フレーズ（失敗しても本体は動く）
 */
async function loadPhraseDicts() {
  await Promise.all([
    loadNeologdPhrases().then(() => rebuildCombinedPhraseTrie()).catch(() => {}),
    loadPersonalNamePhrases().catch(() => {})
  ]);
}

/**
 * 辞書変更後に既処理メッセージを付け直す。
 */
function reprocessAll() {
  for (const el of collectSuperChatMessageElements(document)) {
    el.removeAttribute("data-ytscf-done");
    el.classList.remove("ytscf-done");
  }
  queueScan();
}

function ensureTokenizer() {
  if (tokenize) return Promise.resolve();
  if (tokenizerPromise) return tokenizerPromise;

  tokenizerPromise = new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: chrome.runtime.getURL("dict/") })
      .build((error, built) => {
        if (error) {
          tokenizerPromise = null;
          reject(error);
          return;
        }
        tokenize = (text) => built.tokenize(text);
        setStatus({ ready: true, error: "" });
        resolve();
      });
  });
  return tokenizerPromise;
}

/**
 * @param {string} text
 */
function convert(text) {
  if (!tokenize) return text;
  const key = text;
  const hit = htmlCache.get(key);
  if (hit != null) return hit;

  const html = buildFuriganaHtml(text, tokenize);
  if (htmlCache.size >= CACHE_MAX) {
    const first = htmlCache.keys().next().value;
    if (first != null) htmlCache.delete(first);
  }
  htmlCache.set(key, html);
  return html;
}

/**
 * @param {HTMLElement} el
 */
function processOne(el) {
  if (!state.enabled || !tokenize) return;

  // 仮想リスト再利用で本文だけ差し替わった場合は付け直す
  if (isAlreadyProcessed(el)) {
    const saved = el.getAttribute("data-ytscf-original");
    const live = extractPlainMessage(el, { ignoreSaved: true });
    if (saved != null && saved === live) return;
    el.removeAttribute("data-ytscf-done");
    el.removeAttribute("data-ytscf-original");
    el.classList.remove("ytscf-done");
  }

  const plain = extractPlainMessage(el);
  if (!plain || !needsFurigana(plain)) {
    // 漢字なしでも再処理しないようマークだけ
    el.setAttribute("data-ytscf-done", "1");
    el.classList.add("ytscf-done");
    return;
  }

  const html = convert(plain);
  if (!html || html === plain) {
    el.setAttribute("data-ytscf-done", "1");
    return;
  }

  applyFuriganaToMessage(el, html, plain);
  processedCount += 1;
  setStatus({ processedCount });
}

function scan() {
  scanQueued = false;
  if (!state.enabled) return;
  if (!tokenize || !learningReady) {
    void Promise.all([
      ensureTokenizer(),
      learningReady ? Promise.resolve() : reapplyUserReadings(),
      loadPhraseDicts()
    ])
      .then(() => queueScan())
      .catch((error) => {
        console.warn("[YT Super Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
    return;
  }

  const nodes = collectSuperChatMessageElements(document);
  for (const el of nodes) processOne(el);
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

async function loadState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const saved = data?.[STORAGE_KEY];
    state = { enabled: saved?.enabled !== false };
  } catch {
    state = { enabled: true };
  }
  setStatus({});
  if (state.enabled) {
    void Promise.all([ensureTokenizer(), reapplyUserReadings(), loadPhraseDicts()])
      .then(() => queueScan())
      .catch((error) => {
        console.warn("[YT Super Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[USER_READING_DICT_KEY]) {
    void reapplyUserReadings().then(() => {
      if (state.enabled) reprocessAll();
    });
  }

  if (!changes[STORAGE_KEY]) return;
  const saved = changes[STORAGE_KEY].newValue;
  state = { enabled: saved?.enabled !== false };
  if (!state.enabled) {
    restoreAllMessages(document);
    setStatus({ enabled: false });
    return;
  }
  void Promise.all([ensureTokenizer(), reapplyUserReadings(), loadPhraseDicts()])
    .then(() => {
      reprocessAll();
    })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "YTSCF_PING") {
    sendResponse({
      ok: true,
      enabled: state.enabled,
      ready: Boolean(tokenize),
      processedCount,
      href: location.href,
      hasKanjiProbe: hasKanji("漢字")
    });
    return false;
  }
  return false;
});

const mo = new MutationObserver(() => {
  if (moTimer) return;
  moTimer = window.setTimeout(() => {
    moTimer = 0;
    queueScan();
  }, 200);
});

mo.observe(document.documentElement, { childList: true, subtree: true });

installReadingPicker(document);
installFuriganaHoverHighlight(document);

void loadState();
queueScan();
