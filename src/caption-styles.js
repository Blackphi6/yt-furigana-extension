import { fitRubyReadings } from "./ruby-layout.js";

const styleSnapshots = new WeakMap();
const styleGuards = new WeakMap();

const FONT_SIZE_ATTR = "data-yt-furigana-font-size";
const BACKGROUND_ATTR = "data-yt-furigana-bg";
const LINE_WIDTH_ATTR = "data-yt-furigana-line-width";

/** YouTube の Background 既定（Window 0% で見える文字帯） */
const YT_DEFAULT_BACKGROUND = "rgba(8, 8, 8, 0.75)";

function parseFontSizePx(value) {
  return Number.parseFloat(value) || 0;
}

export function parseBackgroundAlpha(color) {
  if (!color || color === "transparent") return 0;
  if (color.startsWith("rgba")) {
    const alpha = Number.parseFloat(color.split(",").at(-1));
    return Number.isFinite(alpha) ? alpha : 0;
  }
  if (color.startsWith("rgb(")) return 1;
  return 0;
}

export function hasVisibleBackground(color) {
  return parseBackgroundAlpha(color) > 0.01;
}

function captureNodeStyle(node) {
  const computed = getComputedStyle(node);
  return {
    fontSize: computed.fontSize,
    lineHeight: computed.lineHeight,
    color: computed.color,
    backgroundColor: computed.backgroundColor,
    textShadow: computed.textShadow
  };
}

function getMaxFontSizeInTree(root) {
  let bestPx = 0;
  let bestValue = null;

  const visit = (node) => {
    if (!(node instanceof HTMLElement)) return;

    const fontSize = getComputedStyle(node).fontSize;
    const px = parseFontSizePx(fontSize);
    if (px > bestPx) {
      bestPx = px;
      bestValue = fontSize;
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return bestValue || getComputedStyle(root).fontSize;
}

/**
 * ルビ追加前のフォントサイズを固定する。
 * YouTube は字幕が高くなると自動縮小するので、一度測った値を属性に残す。
 */
function lockFontSize(element, candidate) {
  const locked = element.getAttribute(FONT_SIZE_ATTR);
  const lockedPx = parseFontSizePx(locked);
  const candidatePx = parseFontSizePx(candidate);
  if (lockedPx > 0 && (candidatePx <= 0 || candidatePx + 0.5 < lockedPx)) {
    return locked;
  }
  if (candidatePx > 0) {
    element.setAttribute(FONT_SIZE_ATTR, candidate);
    return candidate;
  }
  return locked || candidate;
}

export function resolveCaptionBackgroundColor(element) {
  if (!element || typeof element !== "object") return null;
  if (typeof HTMLElement !== "undefined" && !(element instanceof HTMLElement)) {
    return null;
  }
  if (typeof element.querySelector !== "function") return null;

  const stored = element.getAttribute?.(BACKGROUND_ATTR);
  if (stored && hasVisibleBackground(stored)) return stored;

  const candidates = [];
  const push = (node) => {
    if (node instanceof HTMLElement && !candidates.includes(node)) {
      candidates.push(node);
    }
  };

  push(element);
  push(element.querySelector?.(".ytp-caption-segment"));
  push(element.closest?.(".ytp-caption-segment"));
  push(element.closest?.(".caption-visual-line"));
  push(element.closest?.(".vjs-text-track-cue-line"));

  const container = element.closest?.(
    ".caption-window, .captions-text, .html5-video-player, .vjs-text-track-display, .video-js"
  );
  if (container) {
    for (const seg of container.querySelectorAll(
      ".ytp-caption-segment, .vjs-text-track-cue-line > span"
    )) {
      if (seg === element) continue;
      if (!seg.hasAttribute("data-yt-furigana-styled")) push(seg);
      const saved = seg.getAttribute(BACKGROUND_ATTR);
      if (saved && hasVisibleBackground(saved)) return saved;
    }
  }

  for (const node of candidates) {
    const bg = getComputedStyle(node).backgroundColor;
    if (hasVisibleBackground(bg)) return bg;
  }

  return null;
}

export function captureCaptionStyles(element) {
  const liveBg = resolveCaptionBackgroundColor(element);
  const backgroundColor = liveBg || YT_DEFAULT_BACKGROUND;
  element.setAttribute(BACKGROUND_ATTR, backgroundColor);

  const fontSize = lockFontSize(element, getMaxFontSizeInTree(element));

  // ルビ余白追加前の行幅／窓幅を記録 → 1行維持の縮小基準
  if (!element.getAttribute(LINE_WIDTH_ATTR)) {
    const win = element.closest(
      ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window"
    );
    const winW = win instanceof HTMLElement ? win.clientWidth : 0;
    const selfW = Math.ceil(element.getBoundingClientRect().width);
    const available = Math.max(selfW, winW > 12 ? winW - 12 : 0);
    if (available > 0) {
      element.setAttribute(LINE_WIDTH_ATTR, String(available));
    }
  }

  if (styleSnapshots.has(element)) {
    const existing = styleSnapshots.get(element);
    existing.segment.backgroundColor = backgroundColor;
    existing.backgroundColor = backgroundColor;
    existing.segmentFontSize = fontSize;
    existing.segment.fontSize = fontSize;
    return existing;
  }

  const captionWindow = element.closest(
    ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window"
  );
  const segmentStyle = captureNodeStyle(element);
  segmentStyle.backgroundColor = backgroundColor;
  segmentStyle.fontSize = fontSize;

  const snapshot = {
    segmentFontSize: fontSize,
    segment: segmentStyle,
    window: captionWindow ? captureNodeStyle(captionWindow) : null,
    windowNode: captionWindow,
    backgroundColor
  };

  styleSnapshots.set(element, snapshot);
  return snapshot;
}

function applyBaseStyles(element, snapshot) {
  const fontSize = snapshot.segmentFontSize || snapshot.segment?.fontSize;
  if (fontSize && parseFontSizePx(fontSize) > 0) {
    element.style.setProperty("font-size", fontSize, "important");
  }
  if (snapshot.segment?.color) {
    element.style.setProperty("color", snapshot.segment.color, "important");
  }
  if (snapshot.segment?.textShadow && snapshot.segment.textShadow !== "none") {
    element.style.setProperty("text-shadow", snapshot.segment.textShadow, "important");
  }
  // line-height / transform は YouTube の自動縮小に使われるので復元しない
}

/**
 * Background は字幕要素にだけ塗る。
 * ruby / rt にも同じ半透明を重ねると、ルビ部分だけ二重合成で濃く見える。
 * ルビ用の余白は ruby の padding-top 側で確保し、帯は親1枚で伸ばす。
 */
export function paintCaptionBackground(element, snapshot) {
  if (!(element instanceof HTMLElement) || !snapshot) return;

  const bg =
    element.getAttribute(BACKGROUND_ATTR) ||
    snapshot.backgroundColor ||
    snapshot.segment?.backgroundColor ||
    YT_DEFAULT_BACKGROUND;

  element.style.setProperty("background-color", bg, "important");
  element.style.setProperty("box-decoration-break", "clone", "important");
  element.style.setProperty("-webkit-box-decoration-break", "clone", "important");

  for (const ruby of element.querySelectorAll("ruby")) {
    ruby.style.removeProperty("background-color");
    ruby.style.removeProperty("box-decoration-break");
    ruby.style.removeProperty("-webkit-box-decoration-break");
    const rt = ruby.querySelector("rt");
    if (rt) rt.style.removeProperty("background-color");
  }
}

export function applyCaptionStyles(element) {
  const snapshot = styleSnapshots.get(element);
  if (!snapshot) return;

  // style 属性を丸ごと上書きしない（背景・フォント固定が消える）
  applyBaseStyles(element, snapshot);
  paintCaptionBackground(element, snapshot);

  element.setAttribute("data-yt-furigana-styled", "1");

  requestAnimationFrame(() => {
    fitRubyReadings(element);
    paintCaptionBackground(element, snapshot);
    applyBaseStyles(element, snapshot);
  });
}

export function startCaptionStyleGuard(element) {
  if (styleGuards.has(element)) return;

  const snapshot = styleSnapshots.get(element);
  if (!snapshot) return;

  let applying = false;
  const guard = new MutationObserver(() => {
    if (applying) return;
    if (!element.isConnected) {
      guard.disconnect();
      styleGuards.delete(element);
      return;
    }
    applying = true;
    try {
      applyBaseStyles(element, snapshot);
      paintCaptionBackground(element, snapshot);
    } finally {
      queueMicrotask(() => {
        applying = false;
      });
    }
  });

  guard.observe(element, { attributes: true, attributeFilter: ["style", "class"] });
  styleGuards.set(element, guard);
}

export function releaseCaptionStyles(element) {
  const guard = styleGuards.get(element);
  guard?.disconnect();
  styleGuards.delete(element);

  styleSnapshots.delete(element);
  element.removeAttribute("data-yt-furigana-styled");
  element.removeAttribute(LINE_WIDTH_ATTR);

  for (const prop of [
    "font-size",
    "line-height",
    "color",
    "text-shadow",
    "background-color",
    "padding-top",
    "white-space",
    "box-decoration-break",
    "-webkit-box-decoration-break"
  ]) {
    element.style.removeProperty(prop);
  }

  for (const ruby of element.querySelectorAll("ruby")) {
    ruby.style.removeProperty("background-color");
    ruby.style.removeProperty("box-decoration-break");
    ruby.style.removeProperty("-webkit-box-decoration-break");
    const rt = ruby.querySelector("rt");
    if (rt) rt.style.removeProperty("background-color");
  }
}
