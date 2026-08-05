/**
 * YouTube プレイヤー上の字幕オーバーレイ DOM。
 */

import { applyConfirmedBreaks, readNativeCaptionLines } from "./native-breaks.js";
import { toOverlayHtml } from "./parse-cues.js";

const ROOT_ID = "ytco-overlay-root";
const LINE_ID = "ytco-overlay-line";
/** ネイティブ字幕を隠すときに player へ付けるクラス（CSS で制御・完全に可逆） */
export const HIDE_NATIVE_CLASS = "ytco-hide-native";

/**
 * @param {HTMLElement} player
 * @returns {HTMLElement}
 */
export function ensureOverlayRoot(player) {
  let root = player.querySelector(`#${ROOT_ID}`);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "ytco-overlay-root";
  root.setAttribute("aria-live", "polite");

  const line = document.createElement("div");
  line.id = LINE_ID;
  line.className = "ytco-overlay-line";
  root.appendChild(line);

  // .html5-video-player は position:relative。字幕レイヤの手前に載せる
  player.appendChild(root);
  return root;
}

/**
 * ネイティブ字幕ウィンドウの位置に合わせて overlay の縦位置を決める。
 * ネイティブが見つからない／隠している場合は既定の下寄せに戻す。
 * @param {HTMLElement} player
 * @param {HTMLElement} root
 * @param {{ hideNative?: boolean }} [options]
 */
export function positionOverlay(player, root, options = {}) {
  const captionWindow = player.querySelector(
    ".caption-window, .ytp-caption-window-container .caption-window"
  );

  // ネイティブを隠さない場合のみ、その実位置に重ねて「同じ字幕」に見せる
  if (!options.hideNative && captionWindow) {
    const playerRect = player.getBoundingClientRect();
    const capRect = captionWindow.getBoundingClientRect();
    if (playerRect.height > 0 && capRect.height > 0) {
      const bottomPx = Math.max(0, playerRect.bottom - capRect.bottom);
      root.style.bottom = `${bottomPx}px`;
      root.dataset.anchored = "native";
      return;
    }
  }

  root.style.bottom = "";
  root.dataset.anchored = "default";
}

/**
 * @param {HTMLElement} player
 * @param {boolean} hide
 */
export function setHideNative(player, hide) {
  if (!player) return;
  player.classList.toggle(HIDE_NATIVE_CLASS, Boolean(hide));
}

/**
 * cue HTML を、YouTube が実際に割っている行に合わせて描画する。
 * @param {HTMLElement | null} root
 * @param {{ html?: string, fontSize?: number, enabled?: boolean } | null} state
 * @param {HTMLElement | null} [player]
 */
export function renderOverlay(root, state, player = null) {
  if (!root) return;
  const line = root.querySelector(`#${LINE_ID}`);
  if (!line) return;

  const enabled = state?.enabled !== false;
  const rawHtml = toOverlayHtml(String(state?.html || ""));
  const nativeLines = player ? readNativeCaptionLines(player) : [];
  const confirmed = applyConfirmedBreaks(rawHtml, nativeLines);
  const html = confirmed.html;
  const fontSize = Number(state?.fontSize) || 28;

  root.dataset.enabled = enabled ? "1" : "0";
  root.dataset.breakMode = confirmed.mode;
  root.dataset.breakReason = confirmed.reason;
  root.style.setProperty("--ytco-font-size", `${fontSize}px`);

  if (!enabled || !html) {
    line.innerHTML = "";
    root.hidden = true;
    return;
  }

  root.hidden = false;
  if (line.dataset.html !== html) {
    line.innerHTML = html;
    line.dataset.html = html;
  }
}

export function removeOverlay(player) {
  player?.querySelector?.(`#${ROOT_ID}`)?.remove();
  player?.classList?.remove(HIDE_NATIVE_CLASS);
}
