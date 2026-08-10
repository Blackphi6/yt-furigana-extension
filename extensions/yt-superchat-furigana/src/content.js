/**
 * YouTube ライブチャット iframe 内の Super Chat / 通常チャット、
 * および StreamYard ステージ上のコメントバナーにふりがなを付ける。
 * timedtext は使わない。アーカイブ全件取得のみチャット再生 API を手動で使う。
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
import { loadPlaceNamePhrases } from "../../../src/place-name-phrases.js";
import { loadStationPhrases } from "../../../src/station-phrases.js";
import { loadCorporateNamePhrases } from "../../../src/corporate-name-phrases.js";
import { loadWikidataKanaPhrases } from "../../../src/wikidata-kana-phrases.js";
import { loadSudachiFullPhrases } from "../../../src/sudachi-full-phrases.js";
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
import {
  HIDE_TEXT_MESSAGES_CLASS,
  isAnyTargetEnabled,
  normalizeYtscfState
} from "./state.js";
import {
  ingestPaidMessagesFromDocument,
  resolveVideoId
} from "./sc-ledger.js";
import { installScLedgerPanel, isTopYoutubeWatchFrame } from "./sc-ledger-panel.js";

const STORAGE_KEY = "ytscfState";
const CACHE_MAX = 400;

/** @type {import("./state.js").YtscfState} */
let state = {
  superChatEnabled: true,
  chatEnabled: true,
  hideTextMessages: false,
  ledgerEnabled: false,
  readingApiEnabled: false
};

/** @type {{ refresh?: () => void, destroy?: () => void } | null} */
let ledgerPanel = null;

/** 読み API 変換中の要素（二重実行防止） */
const pendingApiEls = new WeakSet();

/**
 * Stylus 相当: 通常チャット行を表示／非表示。
 * @param {boolean} on
 */
function applyHideTextMessages(on) {
  document.documentElement.classList.toggle(HIDE_TEXT_MESSAGES_CLASS, Boolean(on));
}

/** @type {((text: string) => any[]) | null} */
let tokenize = null;

/** @type {Promise<void> | null} */
let tokenizerPromise = null;

/** @type {Map<string, string>} */
const htmlCache = new Map();

let processedCount = 0;
let ledgerCount = 0;
let moTimer = 0;
let scanQueued = false;
let learningReady = false;
let ledgerInflight = false;
let statusTimer = 0;
/** @type {Record<string, unknown>} */
let statusPending = {};

function currentVideoId() {
  // チャット iframe は v= が無いので top / chatframe も見る
  return resolveVideoId({ href: location.href, doc: document });
}

function setStatus(partial) {
  Object.assign(statusPending, partial || {});
  if (statusTimer) return;
  // storage 書き込み連打で YouTube が重いので間引く
  statusTimer = window.setTimeout(() => {
    statusTimer = 0;
    const patch = statusPending;
    statusPending = {};
    try {
      chrome.storage.local.set({
        ytscfRuntime: {
          ready: Boolean(tokenize),
          processedCount,
          ledgerCount,
          ledgerEnabled: state.ledgerEnabled,
          readingApiEnabled: state.readingApiEnabled,
          superChatEnabled: state.superChatEnabled,
          chatEnabled: state.chatEnabled,
          hideTextMessages: state.hideTextMessages,
          enabled: isAnyTargetEnabled(state),
          href: location.href,
          videoId: currentVideoId(),
          ...patch
        }
      });
    } catch {
      /* ignore */
    }
  }, 800);
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
 * 人名・地名・駅・法人・Wikidata・Sudachi Full固有・NEologd（失敗しても本体は動く）
 */
async function loadPhraseDicts() {
  await Promise.all([
    loadNeologdPhrases().then(() => rebuildCombinedPhraseTrie()).catch(() => {}),
    loadPlaceNamePhrases().then(() => rebuildCombinedPhraseTrie()).catch(() => {}),
    loadStationPhrases().then(() => rebuildCombinedPhraseTrie()).catch(() => {}),
    loadCorporateNamePhrases()
      .then(() => rebuildCombinedPhraseTrie())
      .catch(() => {}),
    loadWikidataKanaPhrases()
      .then(() => rebuildCombinedPhraseTrie())
      .catch(() => {}),
    loadSudachiFullPhrases()
      .then(() => rebuildCombinedPhraseTrie())
      .catch(() => {}),
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
function convertLocal(text) {
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
 * @param {string} text
 * @returns {Promise<string>}
 */
async function convertViaReadingApi(text) {
  try {
    const res = await chrome.runtime.sendMessage({
      type: "YTSCF_CONVERT_READING_API",
      text
    });
    if (res?.ok && typeof res.html === "string" && res.html) {
      return res.html;
    }
  } catch {
    /* fallback below */
  }
  return "";
}

/**
 * @param {string} text
 */
async function convert(text) {
  if (state.readingApiEnabled) {
    const apiHtml = await convertViaReadingApi(text);
    if (apiHtml) return apiHtml;
    // API 失敗時は端末内へフォールバック
    if (tokenize) return convertLocal(text);
    return text;
  }
  return convertLocal(text);
}

/**
 * @param {HTMLElement} el
 * @param {boolean} enabledForKind
 */
async function processOne(el, enabledForKind) {
  if (!enabledForKind) return;
  if (!state.readingApiEnabled && !tokenize) return;
  if (pendingApiEls.has(el)) return;

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
    el.setAttribute("data-ytscf-done", "1");
    el.classList.add("ytscf-done");
    return;
  }

  pendingApiEls.add(el);
  try {
    const html = await convert(plain);
    if (!html || html === plain) {
      el.setAttribute("data-ytscf-done", "1");
      return;
    }
    // 待ちのあいだに別スキャンで消された場合はスキップ
    if (!el.isConnected) return;
    applyFuriganaToMessage(el, html, plain);
    processedCount += 1;
    setStatus({ processedCount });
  } finally {
    pendingApiEls.delete(el);
  }
}

function scan() {
  scanQueued = false;

  // ふりがな ON/OFF と独立して台帳を拾う（スパチャのみ表示中も蓄積）
  if (state.ledgerEnabled && !ledgerInflight) {
    ledgerInflight = true;
    void ingestPaidMessagesFromDocument(document, {
      videoId: currentVideoId(),
      href: location.href
    })
      .then((result) => {
        if (result.total !== ledgerCount) {
          ledgerCount = result.total;
          setStatus({ ledgerCount });
        }
        // panel は storage.onChanged で更新（ここでは refresh しない）
      })
      .catch(() => {})
      .finally(() => {
        ledgerInflight = false;
      });
  }

  if (!isAnyTargetEnabled(state)) return;
  // 読み API 時もフォールバック用に辞書を用意。API のみでも学習句は載せる
  if (!tokenize || !learningReady) {
    void Promise.all([
      ensureTokenizer(),
      learningReady ? Promise.resolve() : reapplyUserReadings(),
      loadPhraseDicts()
    ])
      .then(() => {
        if (state.readingApiEnabled) {
          chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
        }
        queueScan();
      })
      .catch((error) => {
        console.warn("[YT Live Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
    return;
  }

  if (state.superChatEnabled) {
    for (const el of collectSuperChatMessageElements(document)) {
      void processOne(el, true);
    }
  }
  if (state.chatEnabled) {
    for (const el of collectChatMessageElements(document)) {
      void processOne(el, true);
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
 * @param {import("./state.js").YtscfState} prev
 * @param {import("./state.js").YtscfState} next
 */
function applyStateTransition(prev, next) {
  if (prev.superChatEnabled && !next.superChatEnabled) {
    restoreSuperChatMessages(document);
  }
  if (prev.chatEnabled && !next.chatEnabled) {
    restoreChatMessages(document);
  }
  if (prev.hideTextMessages !== next.hideTextMessages) {
    applyHideTextMessages(next.hideTextMessages);
  }
}

async function loadState() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    state = normalizeYtscfState(data?.[STORAGE_KEY]);
  } catch {
    state = {
      superChatEnabled: true,
      chatEnabled: true,
      hideTextMessages: false,
      ledgerEnabled: false,
      readingApiEnabled: false
    };
  }
  applyHideTextMessages(state.hideTextMessages);
  setStatus({});
  ensureLedgerPanel();
  if (state.readingApiEnabled) {
    chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
  }
  queueScan();
  if (isAnyTargetEnabled(state)) {
    void Promise.all([ensureTokenizer(), reapplyUserReadings(), loadPhraseDicts()])
      .then(() => queueScan())
      .catch((error) => {
        console.warn("[YT Live Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      });
  }
}

const LEDGER_PANEL_ROOT_ID = "ytscf-sc-ledger-panel";

function ensureLedgerPanel() {
  // Shorts や設定オフではパネルを作らず、残骸も消す
  if (!state.ledgerEnabled || !isTopYoutubeWatchFrame()) {
    ledgerPanel?.destroy?.();
    ledgerPanel = null;
    document.getElementById(LEDGER_PANEL_ROOT_ID)?.remove();
    return;
  }
  if (ledgerPanel) {
    ledgerPanel.refresh?.();
    return;
  }
  ledgerPanel = installScLedgerPanel({
    getLedgerEnabled: () => state.ledgerEnabled,
    getVideoId: () => currentVideoId()
  });
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
  ensureLedgerPanel();
  if (next.readingApiEnabled && !prev.readingApiEnabled) {
    chrome.runtime.sendMessage({ type: "YTSCF_CLEAR_READING_API_CACHE" }, () => {});
    chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
    reprocessEnabled();
  } else if (!next.readingApiEnabled && prev.readingApiEnabled) {
    reprocessEnabled();
  }
  queueScan();

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
      hideTextMessages: state.hideTextMessages,
      ledgerEnabled: state.ledgerEnabled,
      readingApiEnabled: state.readingApiEnabled,
      enabled: isAnyTargetEnabled(state),
      ready: Boolean(tokenize),
      processedCount,
      ledgerCount,
      href: location.href,
      videoId: currentVideoId(),
      hasKanjiProbe: hasKanji("漢字")
    });
    return false;
  }
  // アーカイブ再生: ポップアップから動画タイムコードへシーク
  if (message?.type === "YTSCF_SEEK") {
    const sec = Number(message.seconds);
    if (!Number.isFinite(sec) || sec < 0) {
      sendResponse({ ok: false, error: "invalid seconds" });
      return false;
    }
    const video =
      document.querySelector("video.html5-main-video") ||
      document.querySelector("video");
    if (!video) {
      sendResponse({ ok: false, error: "no video" });
      return false;
    }
    try {
      video.currentTime = sec;
      void video.play?.();
      sendResponse({ ok: true, seconds: sec });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
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
