/**
 * YouTube / TVer 再生バーのふりがなトグル（Shift+C + コントロールボタン）
 */

export const PLAYER_TOGGLE_ID = "yt-furigana-player-toggle";

/**
 * Shift+C をトグルとして扱うか（入力欄フォーカス時は無効）
 * @param {KeyboardEvent | { key?: string, code?: string, shiftKey?: boolean, target?: EventTarget | null, metaKey?: boolean, ctrlKey?: boolean, altKey?: boolean }} event
 * @returns {boolean}
 */
export function shouldHandleFuriganaToggleKey(event) {
  if (!event || !event.shiftKey) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;

  const key = String(event.key || "");
  const code = String(event.code || "");
  const isC = key === "C" || key === "c" || code === "KeyC";
  if (!isC) return false;

  const target = event.target;
  if (isEditableTarget(target)) return false;
  return true;
}

/**
 * 入力欄フォーカス時はショートカットを無視（DOM なしの単体テストも可）
 * @param {EventTarget | { tagName?: string, isContentEditable?: boolean, disabled?: boolean, readOnly?: boolean, getAttribute?: (name: string) => string | null, closest?: (sel: string) => unknown } | null | undefined} target
 */
export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;

  const tag = String(/** @type {{ tagName?: string }} */ (target).tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA") {
    const input = /** @type {{ disabled?: boolean, readOnly?: boolean }} */ (target);
    if (input.disabled || input.readOnly) return false;
    return true;
  }
  if (tag === "SELECT") return true;

  const el = /** @type {{ isContentEditable?: boolean, getAttribute?: (n: string) => string | null, closest?: (s: string) => unknown }} */ (
    target
  );
  if (el.isContentEditable === true || el.getAttribute?.("contenteditable") === "true") {
    return true;
  }
  if (typeof el.closest === "function") {
    return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
  }
  return false;
}

/**
 * ボタン文言・aria からコントロール種別を判定（TVer 挿入位置用）
 * @param {{ textContent?: string | null, title?: string | null, getAttribute?: (name: string) => string | null, className?: string | { toString?: () => string } }} el
 * @returns {"cc" | "quality" | "speed" | "fullscreen" | "other"}
 */
export function classifyControlLabel(el) {
  if (!el) return "other";
  const className =
    typeof el.className === "string"
      ? el.className
      : el.className?.toString?.() || "";
  if (/\bvjs-fullscreen/.test(className)) return "fullscreen";
  if (/\bvjs-playback-rate|\bvjs-subs-caps|\bvjs-captions/.test(className)) {
    if (/\bvjs-playback-rate/.test(className)) return "speed";
    return "cc";
  }

  const text = [
    el.textContent,
    el.title,
    el.getAttribute?.("aria-label"),
    el.getAttribute?.("data-title")
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (/フルスクリーン|全画面|fullscreen/i.test(text)) return "fullscreen";
  if (/画質|quality|解像度/i.test(text)) return "quality";
  if (/\bcc\b|字幕|クローズド.?キャプション|subtitle|caption|text.?track/i.test(text)) {
    return "cc";
  }
  if (/再生速度|playback.?rate|^x?\s*[\d.]+$/i.test(text) || /^x[\d.]+$/i.test(text)) {
    return "speed";
  }
  // 「x1.0」のような短い速度表示
  if (/^x?\d+(\.\d+)?$/i.test(text)) return "speed";
  return "other";
}

/**
 * コントロールバー内の挿入参照（cc の直前が理想）
 * @param {Element} host
 * @returns {Element | null}
 */
export function pickInsertBefore(host) {
  if (!(host instanceof Element)) return null;
  const nodes = Array.from(
    host.querySelectorAll("button, [role='button'], .vjs-control, .vjs-button, a")
  );
  /** @type {Element | null} */
  let cc = null;
  /** @type {Element | null} */
  let quality = null;
  /** @type {Element | null} */
  let fullscreen = null;

  for (const node of nodes) {
    // 自分自身は無視
    if (node.id === PLAYER_TOGGLE_ID) continue;
    // 直接の子、またはバー直下に近いものだけ
    if (!host.contains(node)) continue;
    const kind = classifyControlLabel(node);
    if (kind === "cc" && !cc) cc = node;
    if (kind === "quality" && !quality) quality = node;
    if (kind === "fullscreen" && !fullscreen) fullscreen = node;
  }

  const preferred = cc || quality || fullscreen;
  if (!preferred) {
    return (
      host.querySelector(".vjs-fullscreen-control") ||
      host.querySelector(".vjs-playback-rate") ||
      null
    );
  }

  // ネストされている場合はバー直下の祖先を返す
  let insert = preferred;
  while (insert.parentElement && insert.parentElement !== host) {
    insert = insert.parentElement;
  }
  return insert.parentElement === host ? insert : preferred;
}

function createIconLabel(slash) {
  const label = document.createElement("span");
  label.className = "yt-furigana-player-toggle__label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = "ルビ";
  if (slash) {
    label.classList.add("is-slashed");
  }
  return label;
}

function labelsFor(enabled) {
  if (enabled) {
    return {
      title: "ふりがなオフ（Shift+C）",
      aria: "ふりがなオン。クリックまたは Shift+C でオフ"
    };
  }
  return {
    title: "ふりがなオン（Shift+C）",
    aria: "ふりがなオフ。クリックまたは Shift+C でオン"
  };
}

/**
 * @returns {{ host: Element, kind: "youtube" | "tver" | "floating" } | null}
 */
export function findControlPlacement() {
  const ytRight = document.querySelector(".ytp-right-controls");
  if (ytRight) return { host: ytRight, kind: "youtube" };

  const tverBar =
    document.querySelector(".vjs-control-bar") || findTverControlBarByAnchors();
  if (tverBar) return { host: tverBar, kind: "tver" };

  const player =
    document.querySelector(".video-js") ||
    document.querySelector("#movie_player") ||
    document.querySelector(".html5-video-player") ||
    document.querySelector("[class*='EpisodePlayer']") ||
    document.querySelector("[class*='Player']");
  if (player instanceof HTMLElement) return { host: player, kind: "floating" };
  return null;
}

/**
 * TVer カスタムスキンでも cc / 画質 などからバーを推定
 * @returns {Element | null}
 */
function findTverControlBarByAnchors() {
  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], .vjs-button, .vjs-control, a")
  );
  /** @type {Element[]} */
  const anchors = [];
  for (const el of candidates) {
    const kind = classifyControlLabel(el);
    if (kind === "cc" || kind === "quality" || kind === "speed" || kind === "fullscreen") {
      anchors.push(el);
    }
  }
  if (!anchors.length) return null;

  // 共通の祖先で、横並びコントロールらしいノードを探す
  for (const anchor of anchors) {
    let el = anchor.parentElement;
    for (let depth = 0; el && depth < 8; depth += 1, el = el.parentElement) {
      if (el.classList?.contains("vjs-control-bar")) return el;
      const childCount = el.children?.length || 0;
      if (childCount < 3) continue;
      // 複数のコントロール種別がこの行にいるか
      let hits = 0;
      for (const child of Array.from(el.children)) {
        const k = classifyControlLabel(child);
        if (k !== "other") hits += 1;
        // 子の中にもラベルがある場合
        if (k === "other" && child.querySelector) {
          for (const nested of child.querySelectorAll("button, [role='button'], .vjs-control")) {
            if (classifyControlLabel(nested) !== "other") {
              hits += 1;
              break;
            }
          }
        }
      }
      if (hits >= 2) return el;
    }
  }
  return anchors[0].parentElement;
}

/**
 * @param {{ getEnabled: () => boolean, setEnabled: (value: boolean) => void | Promise<void> }} options
 */
export function installPlayerToggle(options) {
  const { getEnabled, setEnabled } = options;
  let button = null;

  function syncToggleUi(enabled) {
    const btn = ensureButton();
    if (!btn) return;
    const on = Boolean(enabled);
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const labels = labelsFor(on);
    btn.title = labels.title;
    btn.setAttribute("aria-label", labels.aria);

    const wrap = btn.querySelector(".yt-furigana-player-toggle__icon");
    if (wrap) {
      wrap.replaceChildren(createIconLabel(!on));
    }
  }

  function buildButton(kind) {
    const btn = document.createElement("button");
    btn.id = PLAYER_TOGGLE_ID;
    btn.type = "button";
    btn.className = "yt-furigana-player-toggle is-off";
    btn.setAttribute("aria-pressed", "false");

    if (kind === "youtube") {
      btn.classList.add("ytp-button");
    } else if (kind === "tver") {
      btn.classList.add("vjs-control", "vjs-button");
    } else {
      btn.classList.add("yt-furigana-player-toggle--floating");
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "yt-furigana-player-toggle__icon";
    iconWrap.appendChild(createIconLabel(true));
    btn.appendChild(iconWrap);

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void setEnabled(!getEnabled());
    });
    return btn;
  }

  function placeButton(btn, placement) {
    const { host, kind } = placement;
    btn.classList.toggle("ytp-button", kind === "youtube");
    btn.classList.toggle("vjs-control", kind === "tver");
    btn.classList.toggle("vjs-button", kind === "tver");
    btn.classList.toggle("yt-furigana-player-toggle--floating", kind === "floating");

    if (kind === "youtube") {
      // 字幕ボタン付近（右コントロール先頭）
      if (btn.parentElement !== host || host.firstElementChild !== btn) {
        host.insertBefore(btn, host.firstChild);
      }
      return;
    }

    if (kind === "tver") {
      const before = pickInsertBefore(host);
      if (before && before.parentElement === host) {
        if (btn.nextSibling !== before || btn.parentElement !== host) {
          host.insertBefore(btn, before);
        }
      } else if (btn.parentElement !== host) {
        host.appendChild(btn);
      }
      return;
    }

    if (btn.parentElement !== host) {
      host.appendChild(btn);
    }
  }

  function ensureButton() {
    const placement = findControlPlacement();
    if (!placement) return null;

    let btn = document.getElementById(PLAYER_TOGGLE_ID);
    if (!(btn instanceof HTMLButtonElement)) {
      btn = buildButton(placement.kind);
    }

    // 初回フローティング固定のまま残らないよう、毎回最適なホストへ再配置
    placeButton(btn, placement);
    button = btn;
    return btn;
  }

  function onKeyDown(event) {
    if (!shouldHandleFuriganaToggleKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    void setEnabled(!getEnabled());
  }

  document.addEventListener("keydown", onKeyDown, true);

  const remount = () => {
    ensureButton();
    syncToggleUi(getEnabled());
  };

  remount();

  const onNavigate = () => remount();
  document.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("yt-navigate-finish", onNavigate);

  // コントロール再生成・後からバーが出たときの再配置（debounce）
  let remountTimer = 0;
  const observer = new MutationObserver(() => {
    window.clearTimeout(remountTimer);
    remountTimer = window.setTimeout(() => {
      const placement = findControlPlacement();
      const btn = document.getElementById(PLAYER_TOGGLE_ID);
      if (!btn || (placement && btn.parentElement !== placement.host)) {
        remount();
      } else if (placement?.kind === "tver" && btn instanceof HTMLButtonElement) {
        // バー内でも cc 前への位置ずれを補正
        const before = pickInsertBefore(placement.host);
        if (before && btn.nextSibling !== before) remount();
      }
    }, 200);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const pollId = window.setInterval(() => {
    const placement = findControlPlacement();
    const btn = document.getElementById(PLAYER_TOGGLE_ID);
    if (!placement) return;
    if (!(btn instanceof HTMLButtonElement) || btn.parentElement !== placement.host) {
      remount();
    }
  }, 2000);

  return {
    syncToggleUi,
    remount,
    dispose() {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("yt-navigate-finish", onNavigate);
      window.removeEventListener("yt-navigate-finish", onNavigate);
      observer.disconnect();
      window.clearInterval(pollId);
      window.clearTimeout(remountTimer);
      button?.remove();
      button = null;
    }
  };
}
