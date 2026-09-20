/**
 * チャット再生から Super Chat だけを辿る（手動・低頻度）。
 * アーカイブに加え、配信中でも巻き戻し（DVR）があれば開始〜今までを取れる。
 * timedtext は使わない。YouTube の get_live_chat_replay と同じ経路。
 */

import {
  buildLedgerEntryId,
  parseTimecodeToSeconds,
  youtubeColorIntToHex
} from "./sc-ledger.js";

export { youtubeColorIntToHex };

const REPLAY_ENDPOINT =
  "https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay";

const DEFAULT_DELAY_MS = 400;

/**
 * @typedef {import("./sc-ledger.js").ScLedgerEntry} ScLedgerEntry
 */

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ページ内スクリプトから JSON オブジェクトを抜く。
 * @param {string} html
 * @param {string} marker 例: "ytInitialData"
 */
export function extractJsonObjectAfterMarker(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  if (eq < 0) return null;
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i])) i += 1;
  if (html[i] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j += 1) {
    const ch = html[j];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * @param {string} html
 */
export function extractInnertubeApiKey(html) {
  const m =
    html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/) ||
    html.match(/INNERTUBE_API_KEY['"]\s*:\s*['"]([^'"]+)/);
  return m ? m[1] : "";
}

/**
 * @param {string} html
 */
export function extractInnertubeClientVersion(html) {
  const m = html.match(/"clientVersion"\s*:\s*"([^"]+)"/);
  return m ? m[1] : "2.20240101.00.00";
}

/**
 * @param {unknown} runs
 */
export function runsToPlainText(runs) {
  if (!Array.isArray(runs)) return "";
  return runs
    .map((r) => {
      if (!r || typeof r !== "object") return "";
      const o = /** @type {Record<string, unknown>} */ (r);
      if (typeof o.text === "string") return o.text;
      const emoji = o.emoji;
      if (emoji && typeof emoji === "object") {
        const e = /** @type {Record<string, unknown>} */ (emoji);
        if (typeof e.shortcuts === "object" && Array.isArray(e.shortcuts)) {
          return String(e.shortcuts[0] || "");
        }
        if (typeof e.emojiId === "string") return e.emojiId;
      }
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * liveChatPaidMessageRenderer / paid sticker → 台帳エントリ
 * @param {Record<string, unknown>} renderer
 * @param {string} videoId
 * @returns {ScLedgerEntry | null}
 */
export function paidRendererJsonToEntry(renderer, videoId) {
  if (!renderer || typeof renderer !== "object") return null;
  const author = String(
    /** @type {{ simpleText?: string }} */ (renderer.authorName)?.simpleText ||
      ""
  ).trim();
  const amount = String(
    /** @type {{ simpleText?: string }} */ (renderer.purchaseAmountText)
      ?.simpleText || ""
  ).trim();
  const messageObj = renderer.message;
  const message =
    messageObj && typeof messageObj === "object"
      ? runsToPlainText(
          /** @type {{ runs?: unknown }} */ (messageObj).runs
        )
      : "";
  const stickerLabel =
    typeof renderer.altText === "string"
      ? renderer.altText
      : String(
          /** @type {{ accessibility?: { accessibilityData?: { label?: string } } }} */ (
            renderer
          ).accessibility?.accessibilityData?.label || ""
        );
  const text = message || stickerLabel;
  const videoTimecode = String(
    /** @type {{ simpleText?: string }} */ (renderer.timestampText)
      ?.simpleText || ""
  ).trim() || null;
  let videoTimecodeSec = videoTimecode
    ? parseTimecodeToSeconds(videoTimecode)
    : null;
  const usec = Number(renderer.timestampUsec);
  // timestampUsec は絶対時刻が多いので、相対タイムコードがあるときだけ優先しない
  if (videoTimecodeSec == null && Number.isFinite(usec) && usec > 0) {
    // 相対 offset が無い場合は observedAt 用にだけ使う
  }
  const idRaw = String(renderer.id || "").trim();
  const id = buildLedgerEntryId(
    idRaw,
    author,
    amount,
    text,
    videoTimecode
  );
  if (!author && !amount && !text) return null;
  const colorHex =
    youtubeColorIntToHex(renderer.bodyBackgroundColor) ||
    youtubeColorIntToHex(renderer.headerBackgroundColor) ||
    null;
  const headerColorHex =
    youtubeColorIntToHex(renderer.headerBackgroundColor) || null;
  const authorPhotoUrl = authorPhotoUrlFromJson(renderer);
  return {
    id,
    author,
    amount,
    message: text,
    observedAt: Number.isFinite(usec) ? Math.floor(usec / 1000) : Date.now(),
    videoTimecode,
    videoTimecodeSec,
    videoId: String(videoId || "").trim(),
    colorHex,
    headerColorHex,
    authorPhotoUrl
  };
}

/**
 * Innertube authorPhoto.thumbnails から最大サイズ URL。
 * @param {Record<string, unknown>} renderer
 * @returns {string | null}
 */
export function authorPhotoUrlFromJson(renderer) {
  const photo = renderer?.authorPhoto;
  if (!photo || typeof photo !== "object") return null;
  const thumbs = /** @type {{ thumbnails?: unknown }} */ (photo).thumbnails;
  if (!Array.isArray(thumbs) || !thumbs.length) return null;
  /** @type {{ url?: string, width?: number }[]} */
  const list = thumbs.filter((t) => t && typeof t === "object");
  list.sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  const url = String(list[0]?.url || "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * actions ツリーから paid renderer を集める。
 * @param {unknown} actions
 * @param {string} videoId
 * @returns {ScLedgerEntry[]}
 */
export function extractPaidEntriesFromActions(actions, videoId) {
  /** @type {ScLedgerEntry[]} */
  const out = [];
  if (!Array.isArray(actions)) return out;

  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    const o = /** @type {Record<string, unknown>} */ (node);
    if (o.liveChatPaidMessageRenderer) {
      const e = paidRendererJsonToEntry(
        /** @type {Record<string, unknown>} */ (o.liveChatPaidMessageRenderer),
        videoId
      );
      if (e) out.push(e);
    }
    if (o.liveChatPaidStickerRenderer) {
      const e = paidRendererJsonToEntry(
        /** @type {Record<string, unknown>} */ (o.liveChatPaidStickerRenderer),
        videoId
      );
      if (e) out.push(e);
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  }

  walk(actions);
  return out;
}

/**
 * continuation 文字列を ytInitialData から探す。
 * @param {unknown} data
 * @returns {{ continuation: string, isReplay: boolean } | null}
 */
export function findLiveChatContinuation(data) {
  /** @type {{ continuation: string, isReplay: boolean } | null} */
  let found = null;

  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node || found) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    const o = /** @type {Record<string, unknown>} */ (node);
    if (o.liveChatReplayContinuationData) {
      const c = /** @type {{ continuation?: string }} */ (
        o.liveChatReplayContinuationData
      ).continuation;
      if (c) {
        found = { continuation: String(c), isReplay: true };
        return;
      }
    }
    if (o.reloadContinuationData) {
      const c = /** @type {{ continuation?: string }} */ (o.reloadContinuationData)
        .continuation;
      // replay 優先。ライブ用は後で上書きしない
      if (c && !found) {
        found = { continuation: String(c), isReplay: false };
      }
    }
    if (
      !found &&
      (o.invalidationContinuationData || o.timedContinuationData)
    ) {
      const raw = /** @type {{ continuation?: string }} */ (
        o.invalidationContinuationData || o.timedContinuationData
      );
      if (raw.continuation) {
        found = { continuation: String(raw.continuation), isReplay: false };
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  }

  walk(data);
  return found;
}

/**
 * 上位チャット／ライブチャット切替の continuation（開始位置はライブチャット側）。
 * @param {unknown} data
 * @returns {unknown[]}
 */
export function findViewSelectorSubMenuItems(data) {
  /** @type {unknown[] | null} */
  let found = null;
  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node || found) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    const o = /** @type {Record<string, unknown>} */ (node);
    if (Array.isArray(o.subMenuItems) && o.subMenuItems.length >= 2) {
      const hasCont = o.subMenuItems.some(
        (item) =>
          item &&
          typeof item === "object" &&
          /** @type {{ continuation?: unknown }} */ (item).continuation
      );
      if (hasCont) {
        found = o.subMenuItems;
        return;
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  }
  walk(data);
  return found || [];
}

/**
 * 再生の先頭（フィルタなしライブチャット）の continuation。
 * yt-dlp と同様、viewSelector の2番目を優先する。
 * @param {unknown} data
 */
export function extractReplayBeginningContinuation(data) {
  const items = findViewSelectorSubMenuItems(data);
  /**
   * @param {unknown} item
   */
  function tokenOf(item) {
    if (!item || typeof item !== "object") return "";
    const cont = /** @type {{ continuation?: { reloadContinuationData?: { continuation?: string } } }} */ (
      item
    ).continuation;
    return String(cont?.reloadContinuationData?.continuation || "").trim();
  }
  for (const item of items) {
    const title = String(
      /** @type {{ title?: unknown }} */ (item && typeof item === "object" ? item : {})
        .title || ""
    );
    if (/上位|Top chat|トップ/i.test(title)) continue;
    if (/ライブ|Live chat|チャット/i.test(title)) {
      const t = tokenOf(item);
      if (t) return t;
    }
  }
  if (items.length >= 2) {
    const t = tokenOf(items[1]);
    if (t) return t;
  }
  const found = findLiveChatContinuation(data);
  return found?.isReplay ? found.continuation : "";
}

/**
 * replayChatItemAction の再生位置（ms）。SC が疎でも進捗を進める。
 * @param {unknown} actions
 */
export function maxReplayOffsetMs(actions) {
  let max = 0;
  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    const o = /** @type {Record<string, unknown>} */ (node);
    const raw = o.videoOffsetTimeMsec;
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n) && n > max) max = n;
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walk(v);
    }
  }
  walk(actions);
  return max;
}

/**
 * 配信中の「開始〜今まで」取得を止めるか。
 * @param {{
 *   untilMs?: number | null,
 *   playerOffsetMs: number,
 *   nextIsReplay?: boolean,
 *   nextContinuation: string,
 *   currentContinuation: string
 * }} opts
 */
export function shouldStopLiveReplayFetch(opts) {
  const next = String(opts.nextContinuation || "");
  const current = String(opts.currentContinuation || "");
  if (!next || next === current) return true;
  const until = opts.untilMs;
  if (until != null && Number.isFinite(until) && until > 0) {
    if (opts.nextIsReplay === false) return true;
    if (opts.playerOffsetMs >= Math.max(0, until - 1500)) return true;
  }
  return false;
}

const CHAT_FRAME_SELECTOR =
  "#chatframe, iframe#chatframe, ytd-live-chat-frame iframe, iframe[src*='live_chat']";

/**
 * @param {string} url
 */
export function isLiveChatReplayUrl(url) {
  return /live_chat_replay/i.test(String(url || ""));
}

/**
 * ライブチャット（再生ではない）の URL か。
 * @param {string} url
 */
export function isLiveChatWatchUrl(url) {
  const s = String(url || "");
  return /live_chat/i.test(s) && !/live_chat_replay/i.test(s);
}

/**
 * iframe の src が空でも、中の location が live_chat なら拾う。
 * @param {Document} [doc]
 */
export function readChatFrameUrl(doc = document) {
  const frame = doc.querySelector?.(CHAT_FRAME_SELECTOR);
  if (!frame) return "";
  try {
    const nested = /** @type {HTMLIFrameElement} */ (frame).contentDocument;
    const href = nested?.location?.href || "";
    if (href && href !== "about:blank") return href;
  } catch {
    /* cross-origin */
  }
  return (
    /** @type {HTMLIFrameElement} */ (frame).src ||
    frame.getAttribute?.("src") ||
    ""
  );
}

/**
 * プレイヤー動画の再生時間（秒）。ライブは Infinity / NaN になりやすい。
 * @param {Document} [doc]
 * @returns {number | null}
 */
export function readMainVideoDurationSec(doc = document) {
  try {
    const video =
      doc.querySelector?.("video.html5-main-video") ||
      doc.querySelector?.("video");
    const dur = Number(/** @type {{ duration?: number } | null} */ (video)?.duration);
    if (!Number.isFinite(dur) || dur <= 0) return null;
    return dur;
  } catch {
    return null;
  }
}

/**
 * 視聴ページがいま配信中か。
 * ※ 終了後のアーカイブも chatframe が live_chat のまま残ることがあるので、
 *   live_chat URL だけでは配信中と断定しない。
 * @param {Document} [doc]
 */
export function detectIsLiveNow(doc = document) {
  try {
    if (doc.querySelector?.(".ytp-live-badge:not([disabled])")) return true;
    const href =
      typeof location !== "undefined" ? String(location.href || "") : "";
    if (/[?&]live=1\b/.test(href)) return true;

    const chatUrl = readChatFrameUrl(doc);
    if (isLiveChatReplayUrl(href) || isLiveChatReplayUrl(chatUrl)) return false;

    // 有限 duration の動画 = アーカイブ／通常動画（終了直後の live_chat 枠があっても）
    const dur = readMainVideoDurationSec(doc);
    if (dur != null) return false;

    // チャット iframe 内など、動画が無い文書からの呼び出し
    try {
      if (typeof window !== "undefined" && window.top && window.top !== window) {
        const topDoc = window.top.document;
        if (topDoc?.querySelector?.(".ytp-live-badge:not([disabled])")) {
          return true;
        }
        if (readMainVideoDurationSec(topDoc) != null) return false;
      }
    } catch {
      /* cross-origin */
    }

    // 判断材料が無い live_chat 単体は配信中寄り（バッジも duration も取れないとき）
    if (isLiveChatWatchUrl(href) || isLiveChatWatchUrl(chatUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * 視聴ページ／チャット枠がアーカイブのチャット再生かどうか。
 * ※ YouTube の巨大 innerHTML は触らない（メインスレッドを止めるため）。
 * @param {Document} doc
 */
export function detectIsChatReplayPage(doc = document) {
  try {
    const href = typeof location !== "undefined" ? String(location.href || "") : "";
    if (isLiveChatReplayUrl(href)) return true;
    const chatUrl = readChatFrameUrl(doc);
    if (isLiveChatReplayUrl(chatUrl)) return true;
    // 配信中の live_chat をアーカイブと誤認しない
    if (isLiveChatWatchUrl(chatUrl) || isLiveChatWatchUrl(href)) return false;
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {string} html
 */
export function readChatBootstrapFromHtml(html) {
  const text = String(html || "");
  const apiKey = extractInnertubeApiKey(text);
  const clientVersion = extractInnertubeClientVersion(text);
  const initialData =
    extractJsonObjectAfterMarker(text, "ytInitialData") ||
    extractJsonObjectAfterMarker(text, 'window["ytInitialData"]');
  const cont = findLiveChatContinuation(initialData);
  const fromStart = extractReplayBeginningContinuation(initialData);
  return {
    apiKey,
    clientVersion,
    continuation: fromStart || cont?.continuation || "",
    isReplay: Boolean(fromStart || cont?.isReplay),
    initialData
  };
}

/**
 * @param {Document} [doc]
 */
export function readChatBootstrapFromDocument(doc = document) {
  // script タグだけ見る（documentElement.innerHTML 全体は重い）
  let html = "";
  try {
    const scripts = doc.querySelectorAll?.(
      "script[nonce], script:not([src])"
    );
    if (scripts && scripts.length) {
      const parts = [];
      for (const s of scripts) {
        const t = s.textContent || "";
        if (
          t.includes("INNERTUBE_API_KEY") ||
          t.includes("ytInitialData") ||
          t.includes("liveChat")
        ) {
          parts.push(t);
        }
        if (parts.join("").length > 800000) break;
      }
      html = parts.join("\n");
    }
  } catch {
    html = "";
  }
  if (!html) {
    html = String(doc.body?.innerHTML || "").slice(0, 100000);
  }
  return readChatBootstrapFromHtml(html);
}

/**
 * ライブの reload トークン／videoId から、開始位置のチャット再生ページを取る。
 * 巻き戻し非対応の配信では失敗する。
 * @param {{
 *   continuation?: string,
 *   videoId?: string,
 *   signal?: AbortSignal
 * }} opts
 */
export async function fetchLiveChatReplayBootstrap(opts) {
  const token = String(opts.continuation || "").trim();
  const videoId = String(opts.videoId || "").trim();
  const urls = [];
  if (token) {
    urls.push(
      `https://www.youtube.com/live_chat_replay?continuation=${encodeURIComponent(token)}`
    );
  }
  if (videoId) {
    urls.push(
      `https://www.youtube.com/live_chat_replay?v=${encodeURIComponent(videoId)}`
    );
  }
  if (!urls.length) {
    throw new Error("continuation not found（チャット再生が無い動画の可能性）");
  }

  let lastError = /** @type {Error | null} */ (null);
  for (const url of urls) {
    const res = await fetch(url, {
      credentials: "same-origin",
      signal: opts.signal,
      headers: { Accept: "text/html" }
    });
    if (!res.ok) {
      lastError = new Error(
        res.status === 404 || res.status === 400
          ? "この配信は開始からのチャット再生（巻き戻し）に対応していません"
          : `live_chat_replay HTTP ${res.status}`
      );
      continue;
    }
    const html = await res.text();
    const boot = readChatBootstrapFromHtml(html.slice(0, 1_500_000));
    if (boot.isReplay && boot.continuation) return boot;
    lastError = new Error(
      "この配信は開始からのチャット再生（巻き戻し）に対応していません"
    );
  }
  throw lastError || new Error("live_chat_replay bootstrap failed");
}

/**
 * @param {{
 *   videoId: string,
 *   apiKey: string,
 *   clientVersion?: string,
 *   continuation: string,
 *   delayMs?: number,
 *   untilMs?: number | null,
 *   signal?: AbortSignal,
 *   onPage?: (info: {
 *     page: number,
 *     added: number,
 *     totalSeen: number,
 *     playerOffsetMs: number
 *   }) => void
 * }} opts
 */
export async function fetchAllSuperChatsFromReplay(opts) {
  const videoId = String(opts.videoId || "").trim();
  const apiKey = String(opts.apiKey || "").trim();
  let continuation = String(opts.continuation || "").trim();
  const delayMs = Number(opts.delayMs) || DEFAULT_DELAY_MS;
  const clientVersion = opts.clientVersion || "2.20240101.00.00";
  if (!videoId) throw new Error("videoId required");
  if (!apiKey) throw new Error("INNERTUBE_API_KEY not found");
  if (!continuation) throw new Error("continuation not found（チャット再生が無い動画の可能性）");
  const untilMs =
    opts.untilMs != null && Number.isFinite(opts.untilMs) && opts.untilMs > 0
      ? Number(opts.untilMs)
      : null;

  /** @type {ScLedgerEntry[]} */
  const all = [];
  const seen = new Set();
  let page = 0;
  let playerOffsetMs = 0;

  while (continuation) {
    if (opts.signal?.aborted) {
      break;
    }
    page += 1;
    const url = `${REPLAY_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
    const body = {
      context: {
        client: {
          clientName: "WEB",
          clientVersion,
          hl: "ja",
          gl: "JP"
        }
      },
      continuation,
      currentPlayerState: {
        playerOffsetMs: String(Math.max(0, playerOffsetMs))
      }
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "ja,en;q=0.8"
      },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal: opts.signal
    });
    if (res.status === 429) {
      throw new Error("HTTP 429（レート制限）。少し待ってから再試行してください");
    }
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        throw new Error(
          "この配信は開始からのチャット再生（巻き戻し）に対応していません"
        );
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const actionRoot =
      data?.continuationContents?.liveChatContinuation?.actions ||
      data?.onResponseReceivedEndpoints ||
      data;
    const entries = extractPaidEntriesFromActions(actionRoot, videoId);
    const offsetMs = maxReplayOffsetMs(actionRoot);
    if (offsetMs > playerOffsetMs) playerOffsetMs = offsetMs;
    let added = 0;
    for (const e of entries) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      all.push(e);
      added += 1;
      if (e.videoTimecodeSec != null) {
        playerOffsetMs = Math.max(
          playerOffsetMs,
          Math.floor(e.videoTimecodeSec * 1000)
        );
      }
    }
    opts.onPage?.({
      page,
      added,
      totalSeen: all.length,
      playerOffsetMs
    });

    const nextFound = findLiveChatContinuation(
      data?.continuationContents?.liveChatContinuation || data
    );
    const next = nextFound?.continuation || "";
    if (
      shouldStopLiveReplayFetch({
        untilMs,
        playerOffsetMs,
        nextIsReplay: nextFound ? nextFound.isReplay : undefined,
        nextContinuation: next,
        currentContinuation: continuation
      })
    ) {
      break;
    }
    continuation = next;
    await sleep(delayMs);
  }

  return all;
}
