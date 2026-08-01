/**
 * Super Chat / ティッカー DOM の抽出と、二重処理防止付きの適用。
 * YouTube timedtext は使わない。
 */

export const DONE_ATTR = "data-ytscf-done";
export const ORIGINAL_ATTR = "data-ytscf-original";

/** Super Chat 本文 */
export const PAID_MESSAGE_SELECTOR =
  "yt-live-chat-paid-message-renderer #message";

/** 上部ティッカーの本文 */
export const TICKER_MESSAGE_SELECTOR =
  "yt-live-chat-ticker-paid-message-item-renderer #message";

export const TARGET_SELECTOR = `${PAID_MESSAGE_SELECTOR}, ${TICKER_MESSAGE_SELECTOR}`;

/**
 * @param {unknown} el
 * @returns {el is HTMLElement}
 */
function isElementLike(el) {
  return Boolean(
    el &&
      typeof el === "object" &&
      typeof /** @type {{ setAttribute?: unknown }} */ (el).setAttribute ===
        "function" &&
      typeof /** @type {{ getAttribute?: unknown }} */ (el).getAttribute ===
        "function"
  );
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {HTMLElement[]}
 */
export function collectSuperChatMessageElements(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll(TARGET_SELECTOR)].filter(isElementLike);
}

/**
 * @param {HTMLElement} el
 */
export function isAlreadyProcessed(el) {
  return Boolean(el?.hasAttribute?.(DONE_ATTR));
}

/**
 * #message からルビ無しのプレーンテキストを取る。
 * @param {HTMLElement} el
 * @param {{ ignoreSaved?: boolean }} [options]
 */
export function extractPlainMessage(el, options = {}) {
  if (!isElementLike(el)) return "";
  if (!options.ignoreSaved) {
    const saved = el.getAttribute(ORIGINAL_ATTR);
    if (saved != null && saved !== "") return saved;
  }

  const clone = el.cloneNode?.(true);
  if (clone?.querySelectorAll) {
    clone.querySelectorAll("rt").forEach((node) => node.remove());
    return String(clone.textContent || "")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return String(el.textContent || "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 漢字が無ければルビ不要。
 * @param {string} text
 */
export function needsFurigana(text) {
  return /[\u3400-\u9fff\uF900-\uFAFF々〻]/.test(String(text || ""));
}

/**
 * HTML を #message に載せ、処理済みマークを付ける。
 * @param {HTMLElement} el
 * @param {string} html
 * @param {string} originalPlain
 */
export function applyFuriganaToMessage(el, html, originalPlain) {
  if (!isElementLike(el)) return false;
  const plain = String(originalPlain || "");
  el.setAttribute(ORIGINAL_ATTR, plain);
  el.setAttribute(DONE_ATTR, "1");
  el.classList?.add?.("ytscf-done");
  el.innerHTML = html;
  return true;
}

/**
 * オフ時に元テキストへ戻す。
 * @param {HTMLElement} el
 */
export function restoreMessage(el) {
  if (!isElementLike(el)) return;
  const original = el.getAttribute(ORIGINAL_ATTR);
  if (original != null) {
    el.textContent = original;
  }
  el.removeAttribute(DONE_ATTR);
  el.removeAttribute(ORIGINAL_ATTR);
  el.classList?.remove?.("ytscf-done");
}

/**
 * @param {ParentNode | null | undefined} root
 */
export function restoreAllMessages(root) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(`[${DONE_ATTR}]`)) {
    if (el instanceof HTMLElement) restoreMessage(el);
  }
}
