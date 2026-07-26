/**
 * YouTube プレイヤー上の字幕オーバーレイ DOM。
 */

const ROOT_ID = "ytco-overlay-root";
const LINE_ID = "ytco-overlay-line";

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
 * @param {HTMLElement | null} root
 * @param {{ html?: string, fontSize?: number, enabled?: boolean } | null} state
 */
export function renderOverlay(root, state) {
  if (!root) return;
  const line = root.querySelector(`#${LINE_ID}`);
  if (!line) return;

  const enabled = state?.enabled !== false;
  const html = String(state?.html || "");
  const fontSize = Number(state?.fontSize) || 28;

  root.dataset.enabled = enabled ? "1" : "0";
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
}
