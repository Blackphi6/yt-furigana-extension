/**
 * YouTube ライブチャット iframe 内の Super Chat / 通常チャットにふりがなを付ける。
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
import { loadOccurrenceOverrideStore } from "../../../src/occurrence-overrides.js";
import { loadNeologdPhrases } from "../../../src/neologd-phrases.js";
import {
  loadPersonalNamePhrases,
  rebuildCombinedPhraseTrie
} from "../../../src/personal-name-phrases.js";
import {
  applyFuriganaToMessage,
  collectChatMessageElements,
  collectSuperChatMessageElements,
  extractPlainMessage,
  isAlreadyProcessed,
  needsFurigana,
  restoreChatMessages,
  restoreSuperChatMessages
} from "./process.js";
import { isAnyTargetEnabled, normalizeYtscfState } from "./state.js";

const STORAGE_KEY = "ytscfState";
const CACHE_MAX = 400;

/** @type {{ superChatEnabled: boolean, chatEnabled: boolean }} */
let state = { superChatEnabled: true, chatEnabled: true };

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
        superChatEnabled: state.superChatEnabled,
        chatEnabled: state.chatEnabled,
        enabled: isAnyTargetEnabled(state),
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
  await loadOccurrenceOverrideStore();
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
 * @param {HTMLElement[]} elements
 */
function clearDoneMarks(elements) {
  for (const el of elements) {
    el.removeAttribute("data-ytscf-done");
    el.classList.remove("ytscf-done");
  }
}

/**
 * 有効な対象だけ付け直す。
 */
function reprocessEnabled() {
  if (state.superChatEnabled) {
    clearDoneMarks(collectSuperChatMessageElements(document));
  }
  if (state.chatEnabled) {
    clearDoneMarks(collectChatMessageElements(document));
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
 * @param {boolean} enabledForKind
 */
function processOne(el, enabledForKind) {
  if (!enabledForKind || !tokenize) return;

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
  if (!isAnyTargetEnabled(state)) return;
  if (!tokenize || !learningReady) {
    void Promise.all([
      ensureTokenizer(),
      learningReady ? Promise.resolve() : reapplyUserReadings(),
      loadPhraseDicts()
    ])
      .then(() => queueScan())
      .catch((error) => {
        console.warn("[YT Live Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
    return;
  }

  if (state.superChatEnabled) {
    for (const el of collectSuperChatMessageElements(document)) {
      processOne(el, true);
    }
  }
  if (state.chatEnabled) {
    for (const el of collectChatMessageElements(document)) {
      processOne(el, true);
    }
  }
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

/**
 * フラグ差分でオフにした側だけ restore。
 * @param {{ superChatEnabled: boolean, chatEnabled: boolean }} prev
 * @param {{ superChatEnabled: boolean, chatEnabled: boolean }} next
 */
function applyStateTransition(prev, next) {
  if (prev.superChatEnabled && !next.superChatEnabled) {
    restoreSuperChatMessages(document);
  }
  if (prev.chatEnabled && !next.chatEnabled) {
    restoreChatMessages(document);
  }
}

async function loadState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    state = normalizeYtscfState(data?.[STORAGE_KEY]);
  } catch {
    state = { superChatEnabled: true, chatEnabled: true };
  }
  setStatus({});
  if (isAnyTargetEnabled(state)) {
    void Promise.all([ensureTokenizer(), reapplyUserReadings(), loadPhraseDicts()])
      .then(() => queueScan())
      .catch((error) => {
        console.warn("[YT Live Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[USER_READING_DICT_KEY]) {
    void reapplyUserReadings().then(() => {
      if (isAnyTargetEnabled(state)) reprocessEnabled();
    });
  }

  if (!changes[STORAGE_KEY]) return;
  const prev = state;
  const next = normalizeYtscfState(changes[STORAGE_KEY].newValue);
  state = next;
  applyStateTransition(prev, next);
  setStatus({});

  if (!isAnyTargetEnabled(state)) {
    return;
  }
  void Promise.all([ensureTokenizer(), reapplyUserReadings(), loadPhraseDicts()])
    .then(() => {
      reprocessEnabled();
    })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "YTSCF_PING") {
    sendResponse({
      ok: true,
      superChatEnabled: state.superChatEnabled,
      chatEnabled: state.chatEnabled,
      enabled: isAnyTargetEnabled(state),
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
