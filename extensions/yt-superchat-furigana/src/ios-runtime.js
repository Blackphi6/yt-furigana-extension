/**
 * iOS / iPad Orion 判定と kuromoji 失敗メッセージ整形（純関数）。
 */

/**
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number }} [nav]
 */
export function isIosLikeRuntime(nav = {}) {
  const ua = String(nav.userAgent || "");
  if (/iP(hone|ad|od)/i.test(ua)) return true;
  const maxTouch =
    typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0;
  if (/Macintosh/i.test(ua) && maxTouch > 1) return true;
  if (/Orion/i.test(ua) && /Mobile|iPad|iPhone|CriOS|FxiOS/i.test(ua)) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} error
 */
export function formatTokenizerError(error) {
  if (error == null) return "tokenizer failed";
  if (typeof error === "string" && error.trim()) return error.trim();
  const msg = /** @type {{ message?: unknown, type?: unknown, target?: { status?: unknown, statusText?: unknown }, constructor?: { name?: string } }} */ (
    error
  );
  if (typeof msg.message === "string" && msg.message.trim()) {
    return msg.message.trim();
  }
  const type = typeof msg.type === "string" ? msg.type : "";
  const status = msg.target?.status;
  const statusText = msg.target?.statusText;
  if (type || status != null) {
    return `dict XHR ${type || "error"}${status != null ? ` ${status}` : ""}${
      statusText ? ` ${statusText}` : ""
    }`.trim();
  }
  if (typeof error === "object" && msg.constructor?.name) {
    return `tokenizer ${msg.constructor.name}`;
  }
  return "tokenizer failed";
}
