/**
 * キーボードショートカット + 読み API（任意オプトイン）
 */
import {
  TOGGLE_HIDE_TEXT_COMMAND,
  withToggledHideTextMessages
} from "./state.js";
import { PUBLIC_READING_API_URL } from "../../../src/default-settings.js";
import { fetchReadingApiHtml } from "./reading-api-lite.js";
import { loadUserReadingStore } from "../../../src/user-reading-dict.js";

const STORAGE_KEY = "ytscfState";
const READING_API_TIMEOUT_MS = 20000;
const CACHE_MAX = 300;

/** @type {Map<string, string>} */
const apiHtmlCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.info("[YT Live Chat Furigana] installed");
  void enableSessionStorageForContentScripts();
});

void enableSessionStorageForContentScripts();

/**
 * content script から chrome.storage.session を使えるようにする。
 * 未設定だと「Access to storage is not allowed from this context」になる。
 */
async function enableSessionStorageForContentScripts() {
  try {
    if (chrome.storage?.session?.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({
        accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
      });
    }
  } catch (err) {
    console.warn(
      "[YT Live Chat Furigana] session setAccessLevel failed",
      err?.message || err
    );
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function toggleHideTextMessages() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const next = withToggledHideTextMessages(data?.[STORAGE_KEY]);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next.hideTextMessages;
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== TOGGLE_HIDE_TEXT_COMMAND) return;
  void toggleHideTextMessages().catch((err) => {
    console.warn("[YT Live Chat Furigana] shortcut failed", err);
  });
});

/**
 * @param {string} text
 */
async function convertWithReadingApi(text) {
  const key = String(text || "");
  const hit = apiHtmlCache.get(key);
  if (hit != null) return hit;

  const store = await loadUserReadingStore();
  const html = await fetchReadingApiHtml(key, {
    endpoint: PUBLIC_READING_API_URL,
    userPhrases: { ...(store.phrases || {}) },
    timeoutMs: READING_API_TIMEOUT_MS
  });
  if (apiHtmlCache.size >= CACHE_MAX) {
    const first = apiHtmlCache.keys().next().value;
    if (first != null) apiHtmlCache.delete(first);
  }
  apiHtmlCache.set(key, html);
  return html;
}

async function warmReadingApi() {
  const base = String(PUBLIC_READING_API_URL || "").replace(/\/+$/, "");
  try {
    await fetch(`${base}/healthz`, { method: "GET" });
  } catch {
    /* ignore */
  }
  return { ok: true, endpoint: `${base}/v1/readings` };
}

/** kuromoji 辞書の中継対象（拡張同梱の .dat.gz のみ） */
const DICT_FILE_RE = /^dict\/[A-Za-z0-9_]+\.dat\.gz$/;

/**
 * @param {ArrayBuffer} buf
 */
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "YTSCF_BG_PING") {
    sendResponse({ ok: true });
    return false;
  }
  // content script から拡張 URL を読めない端末（iPad Orion）向けの辞書中継
  if (message?.type === "YTSCF_DICT_FILE") {
    const path = String(message.path || "");
    if (!DICT_FILE_RE.test(path)) {
      sendResponse({ ok: false, error: "bad path" });
      return false;
    }
    fetch(chrome.runtime.getURL(path))
      .then((res) => {
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => sendResponse({ ok: true, b64: arrayBufferToBase64(buf) }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }
  if (message?.type === "YTSCF_CONVERT_READING_API") {
    convertWithReadingApi(String(message.text || ""))
      .then((html) => sendResponse({ ok: true, html, source: "reading-api" }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }
  if (message?.type === "YTSCF_WARM_READING_API") {
    warmReadingApi()
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }
  if (message?.type === "YTSCF_CLEAR_READING_API_CACHE") {
    apiHtmlCache.clear();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
