/**
 * ytscfState の正規化（旧 enabled からの移行含む）
 */

/** documentElement に付与し、通常チャット行を隠す（Stylus 相当） */
export const HIDE_TEXT_MESSAGES_CLASS = "ytscf-hide-text-messages";

/** manifest.json commands の id と一致させる */
export const TOGGLE_HIDE_TEXT_COMMAND = "toggle-hide-text-messages";

/**
 * @typedef {{
 *   superChatEnabled: boolean,
 *   chatEnabled: boolean,
 *   hideTextMessages: boolean,
 *   ledgerEnabled: boolean,
 *   readingApiEnabled: boolean
 * }} YtscfState
 */

/**
 * @param {unknown} raw
 * @returns {YtscfState}
 */
export function normalizeYtscfState(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const hasNewKeys =
    Object.prototype.hasOwnProperty.call(saved, "superChatEnabled") ||
    Object.prototype.hasOwnProperty.call(saved, "chatEnabled");

  // Stylus 相当。未設定はオフ（既存ユーザーの表示を壊さない）
  const hideTextMessages =
    /** @type {{ hideTextMessages?: unknown }} */ (saved).hideTextMessages ===
    true;

  // 視聴ページ右下の累積パネル＋DOM 蓄積。未設定はオフ（常時表示を避ける）
  const ledgerEnabled =
    /** @type {{ ledgerEnabled?: unknown }} */ (saved).ledgerEnabled === true;

  // 読み API。未設定はオフ（チャット本文をサーバーに送らない既定）
  const readingApiEnabled =
    /** @type {{ readingApiEnabled?: unknown }} */ (saved).readingApiEnabled ===
    true;

  if (hasNewKeys) {
    return {
      superChatEnabled: /** @type {{ superChatEnabled?: unknown }} */ (saved)
        .superChatEnabled !== false,
      chatEnabled: /** @type {{ chatEnabled?: unknown }} */ (saved)
        .chatEnabled !== false,
      hideTextMessages,
      ledgerEnabled,
      readingApiEnabled
    };
  }

  // 旧 { enabled } : false → 両方 off、それ以外 → 両方 on
  const legacyOn = /** @type {{ enabled?: unknown }} */ (saved).enabled !== false;
  return {
    superChatEnabled: legacyOn,
    chatEnabled: legacyOn,
    hideTextMessages,
    ledgerEnabled,
    readingApiEnabled
  };
}

/**
 * @param {YtscfState} state
 */
export function isAnyTargetEnabled(state) {
  return Boolean(state?.superChatEnabled || state?.chatEnabled);
}

/**
 * このフレームで kuromoji・辞書・MutationObserver を起動するか。
 * 視聴ページ本体はチャット iframe と二重起動すると本編が止まる。
 * ただし Orion/iOS では iframe に content script が刺さらないので、
 * 親フレームから橋渡しする必要がある（preferParentChatEngine）。
 * @param {{
 *   href?: string,
 *   ledgerEnabled?: boolean,
 *   hasChatApp?: boolean,
 *   isTopWatchFrame?: boolean,
 *   preferParentChatEngine?: boolean
 * }} [opts]
 */
export function shouldRunLiveChatEngine(opts = {}) {
  const href = String(opts.href || "");
  let hostname = "";
  let pathname = "";
  try {
    const u = new URL(href, "https://www.youtube.com");
    hostname = u.hostname;
    pathname = u.pathname || "";
  } catch {
    return Boolean(opts.hasChatApp);
  }
  if (/(?:^|\.)streamyard\.com$/i.test(hostname)) return true;
  if (pathname.includes("/live_chat")) return true;
  if (opts.hasChatApp) return true;
  if (opts.isTopWatchFrame && (opts.ledgerEnabled || opts.preferParentChatEngine)) {
    return true;
  }
  return false;
}

/**
 * スパチャのみ表示フラグを反転した新 state（storage 書き込み前の純関数）。
 * @param {YtscfState} state
 * @returns {YtscfState}
 */
export function withToggledHideTextMessages(state) {
  const normalized = normalizeYtscfState(state);
  return {
    ...normalized,
    hideTextMessages: !normalized.hideTextMessages
  };
}
