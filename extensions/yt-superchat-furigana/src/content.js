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
import {
  scheduleHeavyPhraseDicts,
  startCorePhraseDicts
} from "../../../src/phrase-dict-boot.js";
import {
  applyFuriganaToMessage,
  collectChatMessageElements,
  collectSuperChatMessageElements,
  extractPlainMessage,
  isAlreadyProcessed,
  listAccessibleChatDocuments,
  needsFurigana,
  restoreChatMessages,
  restoreSuperChatMessages
} from "./process.js";
import {
  applyPageRubyItems,
  listChatFrameWindows,
  listPageRubyTargets
} from "./page-ruby-bridge.js";
import { formatTokenizerError, isIosLikeRuntime } from "./ios-runtime.js";
import {
  HIDE_TEXT_MESSAGES_CLASS,
  isAnyTargetEnabled,
  normalizeYtscfState,
  shouldRunLiveChatEngine
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

/** kuromoji が使えない端末（Orion/iOS 等）では読み API へ自動フォールバック */
let tokenizerFailed = false;
let readingApiFallback = false;

/** kuromoji 起動が長い／固まる端末向け（iPad Orion で無限待ちを防ぐ） */
const KUROMOJI_TIMEOUT_MS = 2500;

function markReadingApiFallback(reason) {
  tokenizerFailed = true;
  readingApiFallback = true;
  setStatus({
    ready: true,
    tokenizerFailed: true,
    readingApiFallback: true,
    engine: "reading-api",
    error: "",
    notice: reason ? `端末内辞書不可 → 読みAPI（${reason}）` : "端末内辞書不可 → 読みAPI"
  });
  try {
    chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
  } catch {
    /* ignore */
  }
}

/** iframe 出現監視（親フレーム専用） */
/** @type {MutationObserver | null} */
let frameMo = null;
/** @type {WeakSet<HTMLIFrameElement>} */
const hookedFrames = new WeakSet();

/**
 * ルビ／スパチャのみ表示用 CSS を iframe 文書へ載せる。
 * content_scripts が刺さらないフレーム向け。
 * @param {Document} doc
 */
function ensureChatDocumentStyles(doc) {
  if (!doc?.documentElement) return;
  if (doc.getElementById("ytscf-injected-css")) return;
  try {
    const link = doc.createElement("link");
    link.id = "ytscf-injected-css";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("dist/content.css");
    (doc.head || doc.documentElement).appendChild(link);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {Document[]}
 */
function chatDocuments() {
  const docs = listAccessibleChatDocuments(document);
  for (const doc of docs) ensureChatDocumentStyles(doc);
  return docs;
}

/**
 * Stylus 相当: 通常チャット行を表示／非表示。
 * @param {boolean} on
 */
function applyHideTextMessages(on) {
  for (const doc of chatDocuments()) {
    doc.documentElement?.classList?.toggle(HIDE_TEXT_MESSAGES_CLASS, Boolean(on));
  }
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
let heavyPhraseDictsScheduled = false;
let ledgerInflight = false;
let statusTimer = 0;
let pickerInstalled = false;
/** @type {WeakSet<Document>} */
const pickerDocs = new WeakSet();
/** @type {MutationObserver | null} */
let mo = null;
/** @type {Record<string, unknown>} */
let statusPending = {};

function currentVideoId() {
  // チャット iframe は v= が無いので top / chatframe も見る
  return resolveVideoId({ href: location.href, doc: document });
}

function hasChatAppInDocument() {
  return chatDocuments().some((doc) => Boolean(doc.querySelector("yt-live-chat-app")));
}

/**
 * contentDocument が取れなくても chatframe の contentWindow があるとき
 * （Orion で台帳だけ動くパターン）。
 */
function preferParentChatEngine() {
  if (!isTopYoutubeWatchFrame()) return false;
  if (hasChatAppInDocument()) return false;
  try {
    const frames = document.querySelectorAll(
      "#chatframe, iframe#chatframe, iframe[src*='live_chat'], ytd-live-chat-frame iframe"
    );
    for (const frame of frames) {
      try {
        if (/** @type {HTMLIFrameElement} */ (frame).contentWindow) return true;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

function shouldRunEngineNow() {
  return shouldRunLiveChatEngine({
    href: location.href,
    ledgerEnabled: state.ledgerEnabled,
    hasChatApp: hasChatAppInDocument(),
    isTopWatchFrame: isTopYoutubeWatchFrame(),
    preferParentChatEngine: preferParentChatEngine()
  });
}

/**
 * @param {Document} doc
 */
function observeRootForDoc(doc) {
  return (
    doc.querySelector("yt-live-chat-app") ||
    doc.querySelector("#items.yt-live-chat-item-list-renderer") ||
    doc.querySelector("#chat-messages") ||
    doc.documentElement
  );
}

function ensurePicker() {
  for (const doc of chatDocuments()) {
    if (pickerDocs.has(doc)) continue;
    pickerDocs.add(doc);
    installReadingPicker(doc);
    installFuriganaHoverHighlight(doc);
  }
  pickerInstalled = true;
}

function stopObserver() {
  if (mo) {
    mo.disconnect();
    mo = null;
  }
}

function hookChatFrame(frame) {
  if (!frame || hookedFrames.has(frame)) return;
  hookedFrames.add(frame);
  frame.addEventListener("load", () => {
    applyHideTextMessages(state.hideTextMessages);
    stopObserver();
    syncLiveChatEngine();
  });
}

function ensureFrameWatcher() {
  if (!isTopYoutubeWatchFrame()) return;
  for (const frame of document.querySelectorAll(
    "#chatframe, iframe#chatframe, iframe[src*='live_chat'], ytd-live-chat-frame iframe"
  )) {
    hookChatFrame(/** @type {HTMLIFrameElement} */ (frame));
  }
  if (frameMo) return;
  frameMo = new MutationObserver(() => {
    for (const frame of document.querySelectorAll(
      "#chatframe, iframe#chatframe, iframe[src*='live_chat'], ytd-live-chat-frame iframe"
    )) {
      hookChatFrame(/** @type {HTMLIFrameElement} */ (frame));
    }
  });
  frameMo.observe(document.documentElement, { childList: true, subtree: true });
}

function ensureObserver() {
  if (mo || !shouldRunEngineNow()) return;
  const debounceMs = isTopYoutubeWatchFrame() ? 800 : 280;
  mo = new MutationObserver(() => {
    if (document.hidden) return;
    if (moTimer) return;
    moTimer = window.setTimeout(() => {
      moTimer = 0;
      queueScan();
    }, debounceMs);
  });
  for (const doc of chatDocuments()) {
    const root = observeRootForDoc(doc);
    if (root) mo.observe(root, { childList: true, subtree: true });
  }
  ensureFrameWatcher();
}

function syncLiveChatEngine() {
  ensureFrameWatcher();
  if (!shouldRunEngineNow()) {
    stopObserver();
    return;
  }
  ensurePicker();
  ensureObserver();
  if (!isAnyTargetEnabled(state) && !state.ledgerEnabled) return;
  void (async () => {
    await Promise.all([
      ensureTokenizer().catch(() => {
        if (!readingApiFallback) markReadingApiFallback("ensureTokenizer");
      }),
      reapplyUserReadings()
    ]);
    if (!tokenizerFailed) await loadCorePhraseDicts();
    queueScan();
  })().catch((error) => {
    console.warn("[YT Live Chat Furigana]", error?.message || error);
    if (!readingApiFallback) {
      markReadingApiFallback(formatTokenizerError(error));
    }
  });
  queueScan();
}

function setStatus(partial) {
  Object.assign(statusPending, partial || {});
  if (statusTimer) return;
  // storage 書き込み連打で YouTube が重いので間引く
  statusTimer = window.setTimeout(() => {
    statusTimer = 0;
    const patch = statusPending;
    statusPending = {};
    const apiReady = readingApiFallback || state.readingApiEnabled;
    try {
      chrome.storage.local.set({
        ytscfRuntime: {
          ready: Boolean(tokenize) || apiReady,
          processedCount,
          ledgerCount,
          ledgerEnabled: state.ledgerEnabled,
          readingApiEnabled: state.readingApiEnabled,
          readingApiFallback,
          tokenizerFailed,
          engine: tokenize ? "kuromoji" : apiReady ? "reading-api" : "none",
          superChatEnabled: state.superChatEnabled,
          chatEnabled: state.chatEnabled,
          hideTextMessages: state.hideTextMessages,
          enabled: isAnyTargetEnabled(state),
          href: location.href,
          videoId: currentVideoId(),
          chatDocs: chatDocuments().length,
          chatWindows: listChatFrameWindows(document).length,
          preferParentChatEngine: preferParentChatEngine(),
          iosLike: isIosLikeRuntime(navigator),
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
 * 小型辞書だけ待って初回ルビ。地名・Sudachi Full 等はアイドル後。
 */
function ensureHeavyPhraseDictsScheduled() {
  if (heavyPhraseDictsScheduled) return;
  heavyPhraseDictsScheduled = true;
  scheduleHeavyPhraseDicts(() => {
    clearHtmlCache();
    if (isAnyTargetEnabled(state)) reprocessEnabled();
  });
}

async function loadCorePhraseDicts() {
  await startCorePhraseDicts();
  ensureHeavyPhraseDictsScheduled();
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
  for (const doc of chatDocuments()) {
    if (state.superChatEnabled) {
      clearDoneMarks(collectSuperChatMessageElements(doc));
    }
    if (state.chatEnabled) {
      clearDoneMarks(collectChatMessageElements(doc));
    }
  }
  queueScan();
}

function ensureTokenizer() {
  if (tokenize) return Promise.resolve();
  if (tokenizerFailed) return Promise.reject(new Error("tokenizer unavailable"));
  if (tokenizerPromise) return tokenizerPromise;

  // iOS 系は最初から読み API（XHR ProgressEvent を踏まない）
  if (isIosLikeRuntime(navigator)) {
    markReadingApiFallback("iOS/Orion");
    return Promise.reject(new Error("tokenizer skipped on iOS-like runtime"));
  }

  tokenizerPromise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      tokenizerPromise = null;
      markReadingApiFallback(`timeout ${KUROMOJI_TIMEOUT_MS}ms`);
      reject(new Error(`kuromoji timeout ${KUROMOJI_TIMEOUT_MS}ms`));
    }, KUROMOJI_TIMEOUT_MS);

    kuromoji
      .builder({ dicPath: chrome.runtime.getURL("dict/") })
      .build((error, built) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          tokenizerPromise = null;
          markReadingApiFallback(formatTokenizerError(error));
          reject(
            error instanceof Error
              ? error
              : new Error(formatTokenizerError(error))
          );
          return;
        }
        tokenize = (text) => built.tokenize(text);
        setStatus({
          ready: true,
          error: "",
          notice: "",
          tokenizerFailed: false,
          engine: "kuromoji"
        });
        resolve();
      });
  });
  return tokenizerPromise;
}

/**
 * @param {string} text
 * @param {{ wrapWords?: boolean }} [options]
 */
function convertLocal(text, options = {}) {
  if (!tokenize) return text;
  const wrapOff = options.wrapWords === false;
  const key = wrapOff ? `nw:${text}` : text;
  const hit = htmlCache.get(key);
  if (hit != null) return hit;

  const html = buildFuriganaHtml(text, tokenize, options);
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
 * @param {{ wrapWords?: boolean }} [options]
 */
async function convert(text, options = {}) {
  // 設定 ON、または端末内辞書失敗時は公開読み API（Orion/iOS 救済）
  if (state.readingApiEnabled || readingApiFallback) {
    const apiHtml = await convertViaReadingApi(text);
    if (apiHtml) return apiHtml;
    if (tokenize) return convertLocal(text, options);
    return text;
  }
  return convertLocal(text, options);
}

/**
 * プレビュー／PNG 用。辞書未ロードならここで用意する。
 * @param {string} text
 */
async function convertFuriganaForPreview(text) {
  const plain = String(text || "");
  if (!plain) return "";
  try {
    if (state.readingApiEnabled || readingApiFallback) {
      const apiHtml = await convertViaReadingApi(plain);
      if (apiHtml) return apiHtml;
    }
    await Promise.all([
      ensureTokenizer().catch(() => {
        readingApiFallback = true;
      }),
      learningReady ? Promise.resolve() : reapplyUserReadings()
    ]);
    if (tokenize) {
      if (!tokenizerFailed) await loadCorePhraseDicts();
      return convertLocal(plain, { wrapWords: false });
    }
    if (readingApiFallback) {
      return (await convertViaReadingApi(plain)) || "";
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * @param {HTMLElement} el
 * @param {boolean} enabledForKind
 */
async function processOne(el, enabledForKind) {
  if (!enabledForKind) return;
  const canLocal = Boolean(tokenize);
  const canApi = state.readingApiEnabled || readingApiFallback;
  if (!canLocal && !canApi) return;
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

/**
 * contentDocument 不可の iframe 向け: MAIN 世界ブリッジで本文を取り、ルビ HTML を返す。
 * @returns {Promise<number>} 適用件数
 */
async function scanViaPageBridge() {
  const canLocal = Boolean(tokenize);
  const canApi = state.readingApiEnabled || readingApiFallback;
  if (!canLocal && !canApi) return 0;
  if (!state.superChatEnabled && !state.chatEnabled) return 0;

  const wins = listChatFrameWindows(document);
  if (!wins.length) return 0;

  let cssHref = "";
  try {
    cssHref = chrome.runtime.getURL("dist/content.css");
  } catch {
    cssHref = "";
  }

  const targets = await listPageRubyTargets(wins, cssHref);
  /** @type {Array<{ key: string, html: string, original: string }>} */
  const batch = [];
  for (const t of targets) {
    if (t.done) continue;
    if (t.kind === "chat" || t.kind === "ticker") {
      if (t.kind === "chat" && !state.chatEnabled) continue;
      if (t.kind === "ticker" && !state.superChatEnabled) continue;
    }
    if (t.kind === "superchat" && !state.superChatEnabled) continue;
    if (!needsFurigana(t.plain)) continue;
    const html = await convert(t.plain);
    if (!html || html === t.plain) continue;
    batch.push({ key: t.key, html, original: t.plain });
  }
  if (!batch.length) return 0;
  const applied = await applyPageRubyItems(wins, batch);
  if (applied > 0) {
    processedCount += applied;
    setStatus({ processedCount, pageBridgeApplied: applied });
  }
  return applied;
}

function scan() {
  scanQueued = false;
  if (!shouldRunEngineNow()) return;

  const docs = chatDocuments();

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
  if ((!tokenize && !readingApiFallback) || !learningReady) {
    void (async () => {
      try {
        await Promise.all([
          ensureTokenizer().catch(() => {
            // 端末内失敗 → 読み API フォールバックを有効化して続行
            if (!readingApiFallback) markReadingApiFallback("scan");
          }),
          learningReady ? Promise.resolve() : reapplyUserReadings()
        ]);
        if (!tokenizerFailed) await loadCorePhraseDicts();
        if (state.readingApiEnabled || readingApiFallback) {
          chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
        }
        queueScan();
      } catch (error) {
        console.warn("[YT Live Chat Furigana]", error?.message || error);
        setStatus({ ready: false, error: String(error?.message || error) });
      }
    })();
    return;
  }

  let domHits = 0;
  if (state.superChatEnabled) {
    for (const doc of docs) {
      for (const el of collectSuperChatMessageElements(doc)) {
        domHits += 1;
        void processOne(el, true);
      }
    }
  }
  if (state.chatEnabled) {
    for (const doc of docs) {
      for (const el of collectChatMessageElements(doc)) {
        domHits += 1;
        void processOne(el, true);
      }
    }
  }

  // Orion: DOM 横断できなくても MAIN 橋で付ける
  if (domHits === 0 || preferParentChatEngine()) {
    void scanViaPageBridge().catch((err) => {
      console.warn("[YT Live Chat Furigana] page bridge", err?.message || err);
    });
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
    for (const doc of chatDocuments()) restoreSuperChatMessages(doc);
  }
  if (prev.chatEnabled && !next.chatEnabled) {
    for (const doc of chatDocuments()) restoreChatMessages(doc);
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
  if (state.readingApiEnabled && shouldRunEngineNow()) {
    chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
  }
  syncLiveChatEngine();
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
    getVideoId: () => currentVideoId(),
    convertFurigana: convertFuriganaForPreview
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes[USER_READING_DICT_KEY] && shouldRunEngineNow()) {
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
    if (shouldRunEngineNow()) {
      chrome.runtime.sendMessage({ type: "YTSCF_WARM_READING_API" }, () => {});
    }
    reprocessEnabled();
  } else if (!next.readingApiEnabled && prev.readingApiEnabled) {
    reprocessEnabled();
  }
  syncLiveChatEngine();
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
      readingApiFallback,
      tokenizerFailed,
      enabled: isAnyTargetEnabled(state),
      ready: Boolean(tokenize) || readingApiFallback || state.readingApiEnabled,
      processedCount,
      ledgerCount,
      href: location.href,
      videoId: currentVideoId(),
      hasKanjiProbe: hasKanji("漢字"),
      chatDocs: chatDocuments().length,
      preferParentChatEngine: preferParentChatEngine(),
      chatWindows: listChatFrameWindows(document).length
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

void loadState();
