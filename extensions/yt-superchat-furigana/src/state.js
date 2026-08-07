/**
 * ytscfState の正規化（旧 enabled からの移行含む）
 */

/**
 * @param {unknown} raw
 * @returns {{ superChatEnabled: boolean, chatEnabled: boolean }}
 */
export function normalizeYtscfState(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const hasNewKeys =
    Object.prototype.hasOwnProperty.call(saved, "superChatEnabled") ||
    Object.prototype.hasOwnProperty.call(saved, "chatEnabled");

  if (hasNewKeys) {
    return {
      superChatEnabled: /** @type {{ superChatEnabled?: unknown }} */ (saved)
        .superChatEnabled !== false,
      chatEnabled: /** @type {{ chatEnabled?: unknown }} */ (saved)
        .chatEnabled !== false
    };
  }

  // 旧 { enabled } : false → 両方 off、それ以外 → 両方 on
  const legacyOn = /** @type {{ enabled?: unknown }} */ (saved).enabled !== false;
  return {
    superChatEnabled: legacyOn,
    chatEnabled: legacyOn
  };
}

/**
 * @param {{ superChatEnabled: boolean, chatEnabled: boolean }} state
 */
export function isAnyTargetEnabled(state) {
  return Boolean(state?.superChatEnabled || state?.chatEnabled);
}
