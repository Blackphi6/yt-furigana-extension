/**
 * Super Chat セッション台帳（DOM 蓄積・端末内 session storage）。
 * タブ／ブラウザ終了で消える。サーバー送信なし。
 */

import { extractPlainMessage } from "./process.js";

/** chrome.storage.session のキー */
export const SC_LEDGER_STORAGE_KEY = "ytscfScLedger";

/** 1 動画あたりの上限（古いものから落とす） */
export const SC_LEDGER_MAX_ITEMS = 2000;

/** 台帳対象の renderer（ティッカーは重複しやすいので本文＋帯の両方） */
export const PAID_RENDERER_SELECTOR = "yt-live-chat-paid-message-renderer";

/** 上部の色付きスパチャ帯（配信中は本文より長く残る） */
export const TICKER_PAID_RENDERER_SELECTOR =
  "yt-live-chat-ticker-paid-message-item-renderer, yt-live-chat-ticker-paid-sticker-item-renderer";

/**
 * @typedef {{
 *   id: string,
 *   author: string,
 *   amount: string,
 *   message: string,
 *   observedAt: number,
 *   videoTimecode: string | null,
 *   videoTimecodeSec: number | null,
 *   videoId: string,
 *   colorHex?: string | null,
 *   headerColorHex?: string | null,
 *   authorPhotoUrl?: string | null,
 *   readAt?: number | null
 * }} ScLedgerEntry
 */

/**
 * @typedef {{
 *   videoId: string,
 *   items: ScLedgerEntry[],
 *   updatedAt: number
 * }} ScLedgerBucket
 */

/**
 * @typedef {{
 *   byVideo: Record<string, ScLedgerBucket>
 * }} ScLedgerStore
 */

/**
 * @returns {ScLedgerStore}
 */
export function emptyLedgerStore() {
  return { byVideo: {} };
}

/**
 * @param {unknown} raw
 * @returns {ScLedgerStore}
 */
export function normalizeLedgerStore(raw) {
  if (!raw || typeof raw !== "object") return emptyLedgerStore();
  const byVideoRaw = /** @type {{ byVideo?: unknown }} */ (raw).byVideo;
  if (!byVideoRaw || typeof byVideoRaw !== "object") return emptyLedgerStore();
  /** @type {Record<string, ScLedgerBucket>} */
  const byVideo = {};
  for (const [videoId, bucket] of Object.entries(byVideoRaw)) {
    if (!videoId || !bucket || typeof bucket !== "object") continue;
    const itemsRaw = /** @type {{ items?: unknown }} */ (bucket).items;
    const items = Array.isArray(itemsRaw)
      ? itemsRaw
          .map((item) => normalizeLedgerEntry(item, videoId))
          .filter(Boolean)
      : [];
    byVideo[videoId] = {
      videoId,
      items: /** @type {ScLedgerEntry[]} */ (items),
      updatedAt: Number(/** @type {{ updatedAt?: unknown }} */ (bucket).updatedAt) || 0
    };
  }
  return { byVideo };
}

/**
 * @param {unknown} raw
 * @param {string} fallbackVideoId
 * @returns {ScLedgerEntry | null}
 */
export function normalizeLedgerEntry(raw, fallbackVideoId = "") {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = String(o.id || "").trim();
  if (!id) return null;
  const videoTimecode =
    o.videoTimecode == null || o.videoTimecode === ""
      ? null
      : String(o.videoTimecode);
  const secRaw = o.videoTimecodeSec;
  const videoTimecodeSec =
    typeof secRaw === "number" && Number.isFinite(secRaw)
      ? secRaw
      : videoTimecode
        ? parseTimecodeToSeconds(videoTimecode)
        : null;
  return {
    id,
    author: String(o.author || "").trim(),
    amount: String(o.amount || "").trim(),
    message: String(o.message || "").trim(),
    observedAt: Number(o.observedAt) || Date.now(),
    videoTimecode,
    videoTimecodeSec,
    videoId: String(o.videoId || fallbackVideoId || "").trim(),
    colorHex:
      o.colorHex == null || o.colorHex === ""
        ? null
        : String(o.colorHex),
    headerColorHex:
      o.headerColorHex == null || o.headerColorHex === ""
        ? null
        : String(o.headerColorHex),
    authorPhotoUrl: normalizePhotoUrl(o.authorPhotoUrl),
    readAt:
      typeof o.readAt === "number" && Number.isFinite(o.readAt) ? o.readAt : null
  };
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizePhotoUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  return s;
}

/**
 * URL から videoId を取る（live_chat?v= / watch?v= / 短縮）。
 * @param {string} href
 */
export function extractVideoIdFromHref(href) {
  const s = String(href || "");
  try {
    const u = new URL(s, "https://www.youtube.com");
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(?:live|shorts)\/([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  const m2 = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return m2 ? m2[1] : "";
}

/**
 * チャット iframe は v= が無いことが多いので、top / chatframe から拾う。
 * ※ ホットパスでは巨大 HTML を読まない。
 * @param {{ href?: string, doc?: Document, allowHtmlScan?: boolean }} [opts]
 */
export function resolveVideoId(opts = {}) {
  /** @type {string[]} */
  const candidates = [];
  if (opts.href) candidates.push(String(opts.href));
  try {
    if (typeof location !== "undefined") candidates.push(location.href);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== "undefined" && window.top && window.top !== window) {
      candidates.push(String(window.top.location.href || ""));
    }
  } catch {
    /* cross-origin */
  }
  const doc = opts.doc || (typeof document !== "undefined" ? document : null);
  try {
    const frame = doc?.querySelector?.(
      "#chatframe, iframe#chatframe, iframe[src*='live_chat']"
    );
    const src =
      /** @type {HTMLIFrameElement | null} */ (frame)?.src ||
      frame?.getAttribute?.("src") ||
      "";
    if (src) candidates.push(src);
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    const id = extractVideoIdFromHref(c);
    if (id) return id;
  }
  if (opts.allowHtmlScan) {
    try {
      const html = String(doc?.documentElement?.innerHTML || "").slice(0, 200000);
      const m = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{6,})"/);
      if (m) return m[1];
    } catch {
      /* ignore */
    }
  }
  return "";
}

/**
 * "1:23:45" / "12:34" / "45" → 秒。不正なら null。
 * @param {string} text
 * @returns {number | null}
 */
export function parseTimecodeToSeconds(text) {
  const raw = String(text || "")
    .trim()
    .replace(/[^\d:]/g, "");
  if (!raw) return null;
  const parts = raw.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return Math.floor(parts[0]);
  if (parts.length === 2) {
    return Math.floor(parts[0] * 60 + parts[1]);
  }
  if (parts.length === 3) {
    return Math.floor(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return null;
}

/**
 * YouTube ライブチャットは yt-* の shadowRoot の中に帯がある。
 * @param {ParentNode | null | undefined} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function queryYtDeepAll(root, selector) {
  if (!root || typeof /** @type {{ querySelectorAll?: unknown }} */ (root).querySelectorAll !== "function") {
    return [];
  }
  /** @type {Element[]} */
  const out = [];
  const seen = new Set();
  /**
   * @param {ParentNode} node
   */
  function walk(node) {
    if (!node || typeof /** @type {{ querySelectorAll?: unknown }} */ (node).querySelectorAll !== "function") {
      return;
    }
    let hits = [];
    try {
      hits = [...node.querySelectorAll(selector)];
    } catch {
      hits = [];
    }
    for (const el of hits) {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    }
    let all = [];
    try {
      all = [...node.querySelectorAll("*")];
    } catch {
      all = [];
    }
    for (const el of all) {
      const sr = /** @type {Element & { shadowRoot?: ShadowRoot | null }} */ (el)
        .shadowRoot;
      if (sr) walk(sr);
    }
  }
  walk(root);
  const rootSr = /** @type {{ shadowRoot?: ShadowRoot | null }} */ (root).shadowRoot;
  if (rootSr) walk(rootSr);
  return out;
}

/**
 * @param {Element | ParentNode | null | undefined} root
 * @param {string} sel
 */
function queryInRenderer(root, sel) {
  if (!root || typeof /** @type {{ querySelector?: unknown }} */ (root).querySelector !== "function") {
    return null;
  }
  const el = /** @type {{ querySelector: (s: string) => Element | null, shadowRoot?: ShadowRoot | null }} */ (
    root
  );
  const direct = el.querySelector(sel) || el.shadowRoot?.querySelector?.(sel) || null;
  if (direct) return direct;
  const sr = el.shadowRoot;
  if (sr?.querySelectorAll) {
    try {
      for (const child of sr.querySelectorAll("*")) {
        const hit = child.shadowRoot?.querySelector?.(sel);
        if (hit) return hit;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {Element | null | undefined} root
 * @param {string} sel
 */
function textOf(root, sel) {
  const el = queryInRenderer(root, sel);
  return String(el?.textContent || "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 安定 ID（DOM id があれば優先。なければ内容ハッシュ）。
 * @param {string} domId
 * @param {string} author
 * @param {string} amount
 * @param {string} message
 * @param {string | null} timecode
 */
export function buildLedgerEntryId(domId, author, amount, message, timecode) {
  const cleaned = String(domId || "").trim();
  if (cleaned && cleaned !== "undefined") return cleaned;
  const key = [author, amount, message, timecode || ""].join("\u0001");
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16)}`;
}

/**
 * paid-message DOM からアイコン URL。
 * @param {Element} renderer
 * @returns {string | null}
 */
export function authorPhotoUrlFromRenderer(renderer) {
  if (!renderer) return null;
  const img =
    queryInRenderer(renderer, "#author-photo img") ||
    queryInRenderer(renderer, "yt-img-shadow#author-photo img") ||
    queryInRenderer(renderer, "#author-photo img[src]");
  const src =
    /** @type {HTMLImageElement | null} */ (img)?.currentSrc ||
    /** @type {HTMLImageElement | null} */ (img)?.src ||
    img?.getAttribute?.("src") ||
    "";
  return normalizePhotoUrl(src);
}

/**
 * ティッカー残骸の「0 0」などを金額として残さない。
 * @param {string} raw
 */
export function sanitizeLedgerAmount(raw) {
  const t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (/^0([.\s:,]*0)*$/.test(t)) return "";
  const hasCurrency =
    /[¥￥$€£₩₹₱]|円|USD|JPY|EUR|GBP|KRW|TWD|HKD|CAD|AUD|PHP/i.test(t);
  if (hasCurrency && /\d/.test(t)) return t;
  // 通貨なしの短い数字は残り秒・寸法などのゴミ
  if (/^[\d\s.,:]+$/.test(t) && t.length <= 8) return "";
  if (/\d/.test(t)) return t;
  return "";
}

/**
 * YouTube の bodyBackgroundColor（符号付き int）→ #rrggbb
 * @param {unknown} colorInt
 */
export function youtubeColorIntToHex(colorInt) {
  const n = Number(colorInt);
  if (!Number.isFinite(n)) return null;
  const u = n >>> 0;
  const r = (u >> 16) & 0xff;
  const g = (u >> 8) & 0xff;
  const b = u & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * rgb() / #RGB / #RRGGBB → #rrggbb
 * @param {string} raw
 */
export function cssColorToHex(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const hex6 = s.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex3 = s.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = [...hex3[1].toLowerCase()].map((c) => `${c}${c}`);
    return `#${r}${g}${b}`;
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return null;
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((x) => Number(x).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** YouTube 公式に近い SC 帯色（本文＝Primary、ヘッダー＝Secondary） */
const SC_TIER_BLUE = { colorHex: "#1e88e5", headerColorHex: "#1565c0" };
const SC_TIER_CYAN = { colorHex: "#00e5ff", headerColorHex: "#00b8d4" };
const SC_TIER_GREEN = { colorHex: "#1de9b6", headerColorHex: "#00bfa5" };
const SC_TIER_YELLOW = { colorHex: "#ffca28", headerColorHex: "#ffb300" };
const SC_TIER_ORANGE = { colorHex: "#f57c00", headerColorHex: "#e65100" };
const SC_TIER_MAGENTA = { colorHex: "#e91e63", headerColorHex: "#c2185b" };
const SC_TIER_RED = { colorHex: "#e62117", headerColorHex: "#d00000" };

/**
 * 金額から YouTube と同じ帯色。取れている実色が無いときの控え。
 * @param {string} amount
 * @returns {{ colorHex: string, headerColorHex: string } | null}
 */
export function superChatColorsFromAmount(amount) {
  const n = parseLedgerAmountNumber(amount);
  if (n == null || n <= 0) return null;
  const s = String(amount || "");
  const usdLike = /\$|USD|€|EUR|£|GBP/i.test(s) && !/[¥￥]|JPY|円/.test(s);
  if (usdLike) {
    if (n >= 100) return { ...SC_TIER_RED };
    if (n >= 50) return { ...SC_TIER_MAGENTA };
    if (n >= 20) return { ...SC_TIER_ORANGE };
    if (n >= 10) return { ...SC_TIER_YELLOW };
    if (n >= 5) return { ...SC_TIER_GREEN };
    if (n >= 2) return { ...SC_TIER_CYAN };
    if (n >= 1) return { ...SC_TIER_BLUE };
    return null;
  }
  if (n >= 10000) return { ...SC_TIER_RED };
  if (n >= 5000) return { ...SC_TIER_MAGENTA };
  if (n >= 2000) return { ...SC_TIER_ORANGE };
  if (n >= 1000) return { ...SC_TIER_YELLOW };
  if (n >= 500) return { ...SC_TIER_GREEN };
  if (n >= 200) return { ...SC_TIER_CYAN };
  if (n >= 100) return { ...SC_TIER_BLUE };
  return null;
}

/**
 * @param {Record<string, unknown> | null} rec
 * @returns {{ colorHex: string | null, headerColorHex: string | null }}
 */
function colorsFromPaidRecord(rec) {
  if (!rec) return { colorHex: null, headerColorHex: null };
  return {
    colorHex: youtubeColorIntToHex(rec.bodyBackgroundColor),
    headerColorHex: youtubeColorIntToHex(rec.headerBackgroundColor)
  };
}

const PAID_BODY_CSS_VARS = [
  "--yt-live-chat-paid-message-primary-color",
  "--yt-live-chat-paid-message-background-color",
  "--yt-live-chat-ticker-paid-message-container-color"
];
const PAID_HEADER_CSS_VARS = [
  "--yt-live-chat-paid-message-secondary-color",
  "--yt-live-chat-paid-message-header-background-color"
];

/**
 * @param {Element} el
 * @param {string[]} names
 */
function readCssColorVar(el, names) {
  const style = /** @type {{ getPropertyValue?: (n: string) => string }} */ (
    el?.style
  );
  let computed = null;
  try {
    if (typeof getComputedStyle === "function" && el && el.nodeType === 1) {
      computed = getComputedStyle(el);
    }
  } catch {
    computed = null;
  }
  for (const name of names) {
    const raw =
      style?.getPropertyValue?.(name) ||
      computed?.getPropertyValue?.(name) ||
      "";
    const hex = cssColorToHex(raw);
    if (hex) return hex;
  }
  return null;
}

/**
 * @param {Element} renderer
 */
function colorsFromPaidElement(renderer) {
  return {
    colorHex: readCssColorVar(renderer, PAID_BODY_CSS_VARS),
    headerColorHex: readCssColorVar(renderer, PAID_HEADER_CSS_VARS)
  };
}

/**
 * 金額も本文も無いスタブ（上部の帯だけ拾った状態）。
 * @param {Partial<ScLedgerEntry> | null | undefined} entry
 */
export function isSparseLedgerEntry(entry) {
  if (!entry) return true;
  const amt = sanitizeLedgerAmount(entry.amount);
  const msg = String(entry.message || "").trim();
  return !amt && !msg;
}

/**
 * @ハンドル差を無視した作者キー。
 * @param {string} author
 */
export function ledgerAuthorKey(author) {
  return String(author || "")
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * Polymer / Innertube の simpleText または runs。
 * @param {unknown} value
 */
function ytSimpleText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (value);
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) {
    return o.runs
      .map((r) => {
        if (!r || typeof r !== "object") return "";
        const t = /** @type {{ text?: unknown }} */ (r).text;
        return typeof t === "string" ? t : "";
      })
      .join("");
  }
  return "";
}

/**
 * ホスト要素そのものは歩かない（DOM 循環を避ける）。
 * @param {unknown} node
 * @param {number} [depth]
 * @returns {Record<string, unknown> | null}
 */
function findPaidRecordInData(node, depth = 0) {
  if (!node || depth > 10) return null;
  if (typeof node !== "object") return null;
  if (typeof /** @type {{ nodeType?: unknown }} */ (node).nodeType === "number") {
    return null;
  }
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findPaidRecordInData(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const o = /** @type {Record<string, unknown>} */ (node);
  if (o.liveChatPaidMessageRenderer && typeof o.liveChatPaidMessageRenderer === "object") {
    return /** @type {Record<string, unknown>} */ (o.liveChatPaidMessageRenderer);
  }
  if (o.liveChatPaidStickerRenderer && typeof o.liveChatPaidStickerRenderer === "object") {
    return /** @type {Record<string, unknown>} */ (o.liveChatPaidStickerRenderer);
  }
  const showItem = o.showItemEndpoint;
  const endpoint =
    o.showLiveChatItemEndpoint ||
    (showItem && typeof showItem === "object"
      ? /** @type {Record<string, unknown>} */ (showItem).showLiveChatItemEndpoint
      : null);
    if (endpoint && typeof endpoint === "object") {
      const renderer = /** @type {Record<string, unknown>} */ (endpoint).renderer;
      const itemToShow = /** @type {Record<string, unknown>} */ (endpoint).itemToShow;
      const hit = findPaidRecordInData(renderer || itemToShow || endpoint, depth + 1);
      if (hit) return hit;
    }
  if (o.purchaseAmountText && (o.authorName || o.message || o.id)) {
    return o;
  }
  for (const v of Object.values(o)) {
    if (!v || typeof v !== "object") continue;
    const hit = findPaidRecordInData(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {Element} el
 * @returns {unknown}
 */
function polymerDataOf(el) {
  try {
    const rec = /** @type {Record<string, unknown>} */ (el);
    if (rec.data && typeof rec.data === "object") return rec.data;
    if (rec.__data && typeof rec.__data === "object") return rec.__data;
    const ctrl = rec.polymerController;
    if (ctrl && typeof ctrl === "object") {
      const cdata = /** @type {Record<string, unknown>} */ (ctrl).data;
      if (cdata && typeof cdata === "object") return cdata;
    }
    // Lit 移行後は data が無く、エンドポイントがホスト直下にある
    if (rec.showItemEndpoint && typeof rec.showItemEndpoint === "object") {
      return { showItemEndpoint: rec.showItemEndpoint };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * paid-message-renderer 1 件から台帳エントリを作る。
 * ティッカーは DOM に本文が無いので Polymer JSON を優先する。
 * @param {Element} renderer
 * @param {{ videoId?: string, now?: number }} [opts]
 * @returns {ScLedgerEntry | null}
 */
export function parsePaidMessageRenderer(renderer, opts = {}) {
  if (!renderer || typeof renderer.querySelector !== "function") return null;
  const videoId = String(opts.videoId || "").trim();
  const fromJson = findPaidRecordInData(polymerDataOf(renderer));
  const jsonAuthor = fromJson ? ytSimpleText(fromJson.authorName) : "";
  const jsonAmount = fromJson
    ? sanitizeLedgerAmount(ytSimpleText(fromJson.purchaseAmountText))
    : "";
  const jsonMessage = fromJson ? ytSimpleText(fromJson.message).trim() : "";
  const jsonTime = fromJson ? ytSimpleText(fromJson.timestampText).trim() : "";
  const jsonId = fromJson ? String(fromJson.id || "").trim() : "";
  const author =
    jsonAuthor ||
    textOf(renderer, "#author-name") ||
    textOf(renderer, "#author-name yt-live-chat-author-chip") ||
    textOf(renderer, "yt-live-chat-author-chip #author-name") ||
    tickerAuthorFallback(renderer);
  const amount =
    jsonAmount ||
    sanitizeLedgerAmount(
      textOf(renderer, "#purchase-amount") ||
        textOf(renderer, "#purchase-amount-column")
    );
  const messageEl = queryInRenderer(renderer, "#message");
  const domMessage = messageEl
    ? extractPlainMessage(/** @type {HTMLElement} */ (messageEl))
    : textOf(renderer, "#message");
  const message = jsonMessage || String(domMessage || "").trim();
  const timecodeRaw =
    jsonTime ||
    textOf(renderer, "#timestamp") ||
    textOf(renderer, "yt-formatted-string#timestamp");
  const videoTimecode = timecodeRaw || null;
  const videoTimecodeSec = videoTimecode
    ? parseTimecodeToSeconds(videoTimecode)
    : null;
  // 空スパチャ（金額だけの Super Chat）も台帳に残す
  if (!author && !amount && !message) return null;
  const domId =
    jsonId ||
    renderer.getAttribute?.("id") ||
    /** @type {{ id?: string }} */ (renderer).id ||
    "";
  const id = buildLedgerEntryId(
    String(domId),
    author,
    amount,
    message,
    videoTimecode
  );
  const fromJsonColors = colorsFromPaidRecord(fromJson);
  const fromCss = colorsFromPaidElement(renderer);
  const fromAmount = superChatColorsFromAmount(amount);
  const colorHex =
    fromJsonColors.colorHex || fromCss.colorHex || fromAmount?.colorHex || null;
  const headerColorHex =
    fromJsonColors.headerColorHex ||
    fromCss.headerColorHex ||
    fromAmount?.headerColorHex ||
    null;
  return {
    id,
    author,
    amount,
    message,
    observedAt: Number(opts.now) || Date.now(),
    videoTimecode,
    videoTimecodeSec,
    videoId,
    authorPhotoUrl: authorPhotoUrlFromRenderer(renderer),
    colorHex,
    headerColorHex
  };
}

function tickerAuthorFallback(renderer) {
  const raw = String(renderer?.textContent || "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const at = raw.match(/@[^\s]{1,40}/);
  if (at) return at[0];
  return raw.slice(0, 40);
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {Element[]}
 */
export function collectPaidMessageRenderers(root) {
  if (!root) return [];
  return queryYtDeepAll(
    root,
    `${PAID_RENDERER_SELECTOR}, ${TICKER_PAID_RENDERER_SELECTOR}`
  );
}

/**
 * 欠けている金額・本文・アイコンを補う（id は prev を維持）。
 * @param {ScLedgerEntry} prev
 * @param {ScLedgerEntry} incoming
 */
function enrichLedgerEntry(prev, incoming) {
  const prevAmt = sanitizeLedgerAmount(prev.amount);
  const nextAmt = sanitizeLedgerAmount(incoming.amount);
  const prevMsg = String(prev.message || "").trim();
  const nextMsg = String(incoming.message || "").trim();
  return {
    ...prev,
    author: prev.author || incoming.author || "",
    amount: nextAmt || prevAmt || "",
    message: nextMsg.length > prevMsg.length ? nextMsg : prevMsg,
    authorPhotoUrl: prev.authorPhotoUrl || incoming.authorPhotoUrl || null,
    colorHex: prev.colorHex || incoming.colorHex || null,
    headerColorHex: prev.headerColorHex || incoming.headerColorHex || null,
    videoTimecode: prev.videoTimecode || incoming.videoTimecode,
    videoTimecodeSec:
      prev.videoTimecodeSec != null ? prev.videoTimecodeSec : incoming.videoTimecodeSec,
    readAt: prev.readAt ?? incoming.readAt ?? null
  };
}

/**
 * @param {ScLedgerEntry} a
 * @param {ScLedgerEntry} b
 */
function ledgerEntryGotRicher(a, b) {
  return (
    a.amount !== b.amount ||
    a.message !== b.message ||
    a.authorPhotoUrl !== b.authorPhotoUrl ||
    a.colorHex !== b.colorHex ||
    a.headerColorHex !== b.headerColorHex
  );
}

/**
 * 同じ作者のスタブが1件だけなら、本文付き行で上書きする。
 * @param {Map<string, ScLedgerEntry>} map
 * @param {ScLedgerEntry} item
 * @returns {string | "skip" | null}
 */
function findSparseTwinId(map, item) {
  const key = ledgerAuthorKey(item.author);
  if (!key) return null;
  /** @type {[string, ScLedgerEntry][]} */
  const same = [];
  for (const [id, prev] of map) {
    if (ledgerAuthorKey(prev.author) === key) same.push([id, prev]);
  }
  if (!same.length) return null;
  const incomingSparse = isSparseLedgerEntry(item);
  if (incomingSparse) {
    if (same.some(([, prev]) => !isSparseLedgerEntry(prev))) return "skip";
    return null;
  }
  const stubs = same.filter(([, prev]) => isSparseLedgerEntry(prev));
  if (stubs.length === 1) return stubs[0][0];
  return null;
}

/**
 * 既存 items に newEntries をマージ（id dedupe、末尾に追加、上限で先頭切り）。
 * @param {ScLedgerEntry[]} existing
 * @param {ScLedgerEntry[]} incoming
 * @param {number} [maxItems]
 * @returns {{ items: ScLedgerEntry[], added: number, changed: boolean }}
 */
export function mergeLedgerItems(
  existing,
  incoming,
  maxItems = SC_LEDGER_MAX_ITEMS
) {
  const map = new Map();
  for (const item of existing || []) {
    if (item?.id) map.set(item.id, item);
  }
  let added = 0;
  let changed = false;
  for (const item of incoming || []) {
    if (!item?.id) continue;
    if (map.has(item.id)) {
      const prev = map.get(item.id);
      if (!prev) continue;
      const next = enrichLedgerEntry(prev, item);
      if (ledgerEntryGotRicher(prev, next)) {
        map.set(item.id, next);
        changed = true;
      }
      continue;
    }
    const twin = findSparseTwinId(map, item);
    if (twin === "skip") continue;
    if (twin) {
      const prev = map.get(twin);
      if (prev) {
        const next = { ...enrichLedgerEntry(prev, item), id: twin };
        if (ledgerEntryGotRicher(prev, next)) {
          map.set(twin, next);
          changed = true;
        }
      }
      continue;
    }
    map.set(item.id, item);
    added += 1;
    changed = true;
  }
  let items = [...map.values()].sort((a, b) => {
    const ka =
      a.videoTimecodeSec != null && Number.isFinite(a.videoTimecodeSec)
        ? a.videoTimecodeSec
        : (a.observedAt || 0) / 1000;
    const kb =
      b.videoTimecodeSec != null && Number.isFinite(b.videoTimecodeSec)
        ? b.videoTimecodeSec
        : (b.observedAt || 0) / 1000;
    return ka - kb;
  });
  if (items.length > maxItems) {
    items = items.slice(items.length - maxItems);
  }
  return { items, added, changed };
}

/**
 * @param {ScLedgerStore} store
 * @param {string} videoId
 * @param {ScLedgerEntry[]} incoming
 * @returns {{ store: ScLedgerStore, added: number, changed: boolean }}
 */
export function upsertLedgerEntries(store, videoId, incoming) {
  const vid = String(videoId || "").trim() || "_unknown";
  const normalized = normalizeLedgerStore(store);
  const prev = normalized.byVideo[vid]?.items || [];
  const tagged = (incoming || []).map((e) => ({
    ...e,
    videoId: e.videoId || vid
  }));
  const { items, added, changed } = mergeLedgerItems(prev, tagged);
  normalized.byVideo[vid] = {
    videoId: vid,
    items,
    updatedAt: Date.now()
  };
  return { store: normalized, added, changed };
}

/**
 * 1 件の「読んだ」フラグを反転する。
 * @param {ScLedgerStore} store
 * @param {string} videoId
 * @param {string} entryId
 * @returns {{ store: ScLedgerStore, changed: boolean, readAt: number | null }}
 */
export function toggleLedgerEntryRead(store, videoId, entryId) {
  const vid = String(videoId || "").trim() || "_unknown";
  const id = String(entryId || "").trim();
  const normalized = normalizeLedgerStore(store);
  const bucket = normalized.byVideo[vid];
  if (!bucket || !id) {
    return { store: normalized, changed: false, readAt: null };
  }
  const idx = bucket.items.findIndex((item) => item.id === id);
  if (idx < 0) {
    return { store: normalized, changed: false, readAt: null };
  }
  const prev = bucket.items[idx];
  const readAt = prev.readAt ? null : Date.now();
  bucket.items[idx] = { ...prev, readAt };
  bucket.updatedAt = Date.now();
  return { store: normalized, changed: true, readAt };
}

/**
 * 全件取得後のステータス文言（0 件は失敗扱いにしない）。
 * @param {ScLedgerEntry[]} entries
 * @param {number} [added]
 */
export function formatFetchAllSuperChatsStatus(entries, added = 0) {
  const n = Array.isArray(entries) ? entries.length : 0;
  if (n === 0) return "スパチャはありませんでした";
  const extra = Number(added) > 0 ? `（新規 ${added}）` : "";
  return `完了: ${n} 件取得${extra}`;
}

/**
 * CSV（BOM 付き UTF-8 想定の文字列）。
 * @param {ScLedgerEntry[]} items
 */
export function ledgerItemsToCsv(items) {
  const header = [
    "observedAtISO",
    "videoTimecode",
    "videoTimecodeSec",
    "author",
    "amount",
    "message",
    "videoId",
    "id"
  ];
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = [header.join(",")];
  for (const item of items || []) {
    rows.push(
      [
        item.observedAt ? new Date(item.observedAt).toISOString() : "",
        item.videoTimecode || "",
        item.videoTimecodeSec ?? "",
        item.author,
        item.amount,
        item.message,
        item.videoId,
        item.id
      ]
        .map(escape)
        .join(",")
    );
  }
  return `\uFEFF${rows.join("\n")}\n`;
}

/**
 * 「¥1,000」「$12.34」「￥500」などから数値だけ取る。
 * @param {string} amount
 * @returns {number | null}
 */
export function parseLedgerAmountNumber(amount) {
  const s = String(amount ?? "")
    .normalize("NFKC")
    .replace(/[,，\s]/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} text
 */
export function normalizeLedgerSearchText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .trim();
}

/**
 * @typedef {{
 *   query?: string,
 *   field?: "all" | "author" | "message" | "amount",
 *   amountMin?: number | null,
 *   amountMax?: number | null
 * }} LedgerSearchQuery
 */

/**
 * ユーザー名・本文・金額で絞る（全件取得後の検索用）。
 * @param {ScLedgerEntry[]} items
 * @param {LedgerSearchQuery} [query]
 */
export function filterLedgerBySearch(items, query = {}) {
  const field =
    query.field === "author" ||
    query.field === "message" ||
    query.field === "amount"
      ? query.field
      : "all";
  const q = normalizeLedgerSearchText(query.query);
  const amountMin = Number.isFinite(query.amountMin) ? Number(query.amountMin) : null;
  const amountMax = Number.isFinite(query.amountMax) ? Number(query.amountMax) : null;
  const qAsAmount = q ? parseLedgerAmountNumber(q) : null;

  return (items || []).filter((item) => {
    const num = parseLedgerAmountNumber(item.amount);
    if (amountMin != null || amountMax != null) {
      if (num == null) return false;
      if (amountMin != null && num < amountMin) return false;
      if (amountMax != null && num > amountMax) return false;
    }
    if (!q) return true;

    const author = normalizeLedgerSearchText(item.author);
    const message = normalizeLedgerSearchText(item.message);
    const hitAuthor = author.includes(q);
    const hitMessage = message.includes(q);
    const hitAmount =
      qAsAmount != null && num != null ? num === qAsAmount : false;

    if (field === "author") return hitAuthor;
    if (field === "message") return hitMessage;
    if (field === "amount") return hitAmount;
    return hitAuthor || hitMessage || hitAmount;
  });
}

/**
 * タイムコード範囲で絞る（秒。null/空は端なし）。
 * @param {ScLedgerEntry[]} items
 * @param {number | null} startSec
 * @param {number | null} endSec
 */
export function filterLedgerByTimecodeRange(items, startSec, endSec) {
  const start =
    startSec == null || !Number.isFinite(startSec) ? null : startSec;
  const end = endSec == null || !Number.isFinite(endSec) ? null : endSec;
  return (items || []).filter((item) => {
    const sec = item.videoTimecodeSec;
    if (sec == null || !Number.isFinite(sec)) {
      // タイムコード無しは「全体」指定時のみ含める
      return start == null && end == null;
    }
    if (start != null && sec < start) return false;
    if (end != null && sec > end) return false;
    return true;
  });
}

/**
 * session を優先し、content script から拒否されたら local へフォールバック。
 * Chrome は既定で session を content script から読めない。
 * @returns {Promise<chrome.storage.StorageArea>}
 */
async function ledgerStorageArea() {
  const session = chrome.storage?.session;
  if (session) {
    try {
      await session.get(SC_LEDGER_STORAGE_KEY);
      return session;
    } catch {
      /* Access to storage is not allowed from this context */
    }
  }
  return chrome.storage.local;
}

/**
 * session storage を読む（無ければ空）。
 * @returns {Promise<ScLedgerStore>}
 */
export async function loadLedgerStore() {
  try {
    const area = await ledgerStorageArea();
    const data = await area.get(SC_LEDGER_STORAGE_KEY);
    return normalizeLedgerStore(data?.[SC_LEDGER_STORAGE_KEY]);
  } catch {
    try {
      const data = await chrome.storage.local.get(SC_LEDGER_STORAGE_KEY);
      return normalizeLedgerStore(data?.[SC_LEDGER_STORAGE_KEY]);
    } catch {
      return emptyLedgerStore();
    }
  }
}

/**
 * @param {ScLedgerStore} store
 */
export async function saveLedgerStore(store) {
  const payload = {
    [SC_LEDGER_STORAGE_KEY]: normalizeLedgerStore(store)
  };
  try {
    const area = await ledgerStorageArea();
    await area.set(payload);
  } catch {
    await chrome.storage.local.set(payload);
  }
}

/**
 * @param {string} videoId
 */
export async function clearLedgerForVideo(videoId) {
  const store = await loadLedgerStore();
  const vid = String(videoId || "").trim() || "_unknown";
  delete store.byVideo[vid];
  await saveLedgerStore(store);
  return store;
}

/**
 * 誤って _unknown に入った件を正しい videoId へ寄せる。
 * @param {string} videoId
 */
export async function adoptUnknownLedgerItems(videoId) {
  const vid = String(videoId || "").trim();
  if (!vid || vid === "_unknown") return loadLedgerStore();
  const store = await loadLedgerStore();
  const orphan = store.byVideo._unknown?.items || [];
  if (!orphan.length) return store;
  const tagged = orphan.map((e) => ({ ...e, videoId: vid }));
  const { store: next } = upsertLedgerEntries(store, vid, tagged);
  delete next.byVideo._unknown;
  await saveLedgerStore(next);
  return next;
}

export const PAGE_PAID_REQUEST_TYPE = "YTSCF_PAGE_PAID_REQUEST";
export const PAGE_PAID_RESULT_TYPE = "YTSCF_PAGE_PAID_RESULT";

/**
 * ページ世界（MAIN）から来た DTO を台帳行にする。
 * @param {unknown} dto
 * @param {string} videoId
 * @param {number} [now]
 * @returns {ScLedgerEntry | null}
 */
export function ledgerEntryFromPageDto(dto, videoId, now) {
  if (!dto || typeof dto !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (dto);
  const author = String(o.author || "").trim();
  const amount = sanitizeLedgerAmount(o.amount);
  const message = String(o.message || "").trim();
  if (!author && !amount && !message) return null;
  const timestamp =
    o.timestamp == null || o.timestamp === "" ? null : String(o.timestamp);
  const id = buildLedgerEntryId(
    String(o.id || "").trim(),
    author,
    amount,
    message,
    timestamp
  );
  const photo = String(o.authorPhotoUrl || "").trim();
  const fromAmount = superChatColorsFromAmount(amount);
  const colorHex =
    cssColorToHex(String(o.colorHex || "")) || fromAmount?.colorHex || null;
  const headerColorHex =
    cssColorToHex(String(o.headerColorHex || "")) ||
    fromAmount?.headerColorHex ||
    null;
  return {
    id,
    author,
    amount,
    message,
    observedAt: Number(now) || Date.now(),
    videoTimecode: timestamp,
    videoTimecodeSec: timestamp ? parseTimecodeToSeconds(timestamp) : null,
    videoId: String(videoId || "").trim(),
    authorPhotoUrl: /^https?:\/\//i.test(photo) ? photo : null,
    colorHex,
    headerColorHex
  };
}

/**
 * ページ世界へ帯の中身を問い合わせる（隔離世界からは Polymer .data が見えない）。
 * @param {Window} win
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown[]>}
 */
export function requestPagePaidDtos(win, timeoutMs = 400) {
  if (!win || typeof win.postMessage !== "function") {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let done = false;
    const timer = setTimeout(() => finish([]), timeoutMs);
    /**
     * @param {MessageEvent} ev
     */
    function onMsg(ev) {
      if (ev.source !== win) return;
      const d = ev.data;
      if (!d || d.type !== PAGE_PAID_RESULT_TYPE || d.id !== id) return;
      finish(Array.isArray(d.entries) ? d.entries : []);
    }
    /**
     * @param {unknown[]} entries
     */
    function finish(entries) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        win.removeEventListener("message", onMsg);
      } catch {
        /* ignore */
      }
      resolve(entries);
    }
    try {
      win.addEventListener("message", onMsg);
      win.postMessage({ type: PAGE_PAID_REQUEST_TYPE, id }, "*");
    } catch {
      finish([]);
    }
  });
}

/**
 * @param {ParentNode[]} roots
 */
async function collectPagePaidDtosFromRoots(roots) {
  /** @type {Set<Window>} */
  const wins = new Set();
  for (const root of roots) {
    const doc =
      /** @type {{ nodeType?: number, defaultView?: Window, ownerDocument?: Document }} */ (
        root
      );
    const asDoc = doc.nodeType === 9 ? /** @type {Document} */ (root) : doc.ownerDocument;
    const win = asDoc?.defaultView;
    if (win) wins.add(win);
    try {
      const frames = asDoc?.querySelectorAll?.("iframe") || [];
      for (const frame of frames) {
        try {
          const nested = /** @type {HTMLIFrameElement} */ (frame).contentWindow;
          if (nested) wins.add(nested);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  const batches = await Promise.all([...wins].map((w) => requestPagePaidDtos(w)));
  return batches.flat();
}

/**
 * document から SC を拾って session に追記。
 * @param {ParentNode} root
 * @param {{ videoId?: string, href?: string, pageDtos?: unknown[] }} [opts]
 * @returns {Promise<{ added: number, total: number, videoId: string }>}
 */
export async function ingestPaidMessagesFromDocument(root, opts = {}) {
  const videoId =
    String(opts.videoId || "").trim() ||
    resolveVideoId({ href: opts.href || "", doc: /** @type {Document | null} */ (root) }) ||
    "_unknown";
  const roots = [root];
  try {
    const frames =
      /** @type {{ querySelectorAll?: Function }} */ (root)?.querySelectorAll?.(
        "iframe"
      ) || [];
    for (const frame of frames) {
      try {
        const nested = /** @type {HTMLIFrameElement} */ (frame).contentDocument;
        if (nested && nested !== root) roots.push(nested);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  const fromDom = roots
    .flatMap((r) => collectPaidMessageRenderers(r))
    .map((el) => parsePaidMessageRenderer(el, { videoId }))
    .filter(Boolean);
  const pageDtos =
    opts.pageDtos || (await collectPagePaidDtosFromRoots(roots));
  const fromPage = (pageDtos || [])
    .map((dto) => ledgerEntryFromPageDto(dto, videoId))
    .filter(Boolean);
  const incoming = [...fromDom, ...fromPage];
  if (!incoming.length) {
    const store = await loadLedgerStore();
    const total = store.byVideo[videoId]?.items?.length || 0;
    return { added: 0, total, videoId };
  }
  const store = await loadLedgerStore();
  const { store: next, added, changed } = upsertLedgerEntries(
    store,
    videoId,
    /** @type {ScLedgerEntry[]} */ (incoming)
  );
  if (added > 0 || changed) await saveLedgerStore(next);
  const total = next.byVideo[videoId]?.items?.length || 0;
  return { added, total, videoId };
}
