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
 *   hideTextMessages: boolean
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

  if (hasNewKeys) {
    return {
      superChatEnabled: /** @type {{ superChatEnabled?: unknown }} */ (saved)
        .superChatEnabled !== false,
      chatEnabled: /** @type {{ chatEnabled?: unknown }} */ (saved)
        .chatEnabled !== false,
      hideTextMessages
    };
  }

  // 旧 { enabled } : false → 両方 off、それ以外 → 両方 on
  const legacyOn = /** @type {{ enabled?: unknown }} */ (saved).enabled !== false;
  return {
    superChatEnabled: legacyOn,
    chatEnabled: legacyOn,
    hideTextMessages
  };
}

/**
 * @param {YtscfState} state
 */
export function isAnyTargetEnabled(state) {
  return Boolean(state?.superChatEnabled || state?.chatEnabled);
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
