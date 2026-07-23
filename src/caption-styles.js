import {
  fitRubyReadings,
  markKeepOneLineCaption,
  KEEP_ONE_LINE_ATTR
} from "./ruby-layout.js";

const styleSnapshots = new WeakMap();
const styleGuards = new WeakMap();

const FONT_SIZE_ATTR = "data-yt-furigana-font-size";
const BACKGROUND_ATTR = "data-yt-furigana-bg";
const LINE_WIDTH_ATTR = "data-yt-furigana-line-width";
const NEEDED_WIDTH_ATTR = "data-yt-furigana-needed-width";

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

/**
 * MV 歌詞など、縁取り／影だけで読ませる透過字幕か。
 * ここに黒帯を被せると公式デザインが潰れる。
 * @param {HTMLElement} element
 */
export function isOutlineOnlyCaption(element) {
  if (typeof HTMLElement === "undefined") return false;
  if (!(element instanceof HTMLElement)) return false;

  const nodes = [element];
  const win = element.closest?.(
    ".caption-window, .captions-text, .ytp-caption-segment"
  );
  if (win instanceof HTMLElement && win !== element) nodes.push(win);

  let sawTransparentHost = false;
  for (const node of nodes) {
    const style = getComputedStyle(node);
    if (hasVisibleBackground(style.backgroundColor)) return false;
    sawTransparentHost = true;
    const shadow = style.textShadow || "";
    if (shadow && shadow !== "none") return true;
    const stroke =
      style.webkitTextStrokeWidth ||
      style.getPropertyValue("-webkit-text-stroke-width") ||
      "";
    if (stroke && stroke !== "0px" && Number.parseFloat(stroke) > 0) return true;
  }

  return (
    sawTransparentHost &&
    Boolean(element.closest?.(".ytp-caption-window-container"))
  );
}

/**
 * 動画色に追従する歌詞字幕など、ネイティブ字形を壊したくないか。
 * （明朝・多色 span・縁取り透過）
 * @param {HTMLElement} element
 */
export function preferNativeStyledCaption(element) {
  if (typeof HTMLElement === "undefined") return false;
  if (!(element instanceof HTMLElement)) return false;
  if (!element.closest?.(".ytp-caption-window-container")) return false;

  if (isOutlineOnlyCaption(element)) return true;

  const style = getComputedStyle(element);
  if (hasVisibleBackground(style.backgroundColor)) return false;

  const family = style.fontFamily || "";
  if (
    /mincho|明朝|serif|游明朝|ヒラギノ明朝|noto\s*serif|yu\s*mincho|hiragino\s*mincho/i.test(
      family
    )
  ) {
    return true;
  }

  const colors = new Set();
  for (const node of [element, ...element.querySelectorAll("span")]) {
    if (!(node instanceof HTMLElement)) continue;
    try {
      const c = getComputedStyle(node).color;
      if (c) colors.add(c);
    } catch {
      /* ignore */
    }
    if (colors.size >= 2) return true;
  }
  return false;
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
  const outlineOnly = !liveBg && isOutlineOnlyCaption(element);
  // 縁取りだけの歌詞字幕のみ白黒強制。通常の YouTube 字幕は設定どおり残す。
  const forceReadable = outlineOnly;
  const backgroundColor = forceReadable
    ? YT_DEFAULT_BACKGROUND
    : liveBg || "transparent";
  element.setAttribute(BACKGROUND_ATTR, backgroundColor);
  if (forceReadable) {
    element.setAttribute("data-yt-furigana-readable", "1");
    element.removeAttribute("data-yt-furigana-outline");
  } else {
    element.removeAttribute("data-yt-furigana-readable");
    element.removeAttribute("data-yt-furigana-outline");
  }

  const fontSize = lockFontSize(element, getMaxFontSizeInTree(element));

  // ルビ注入前に単一行か判定（注入後に測ると誤判定する）
  markKeepOneLineCaption(element);

  // ルビ余白追加前の行幅／窓幅を記録 → 1行維持の縮小基準
  if (!element.getAttribute(LINE_WIDTH_ATTR)) {
    const win = element.closest(
      ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window"
    );
    const winW = win instanceof HTMLElement ? win.clientWidth : 0;
    const selfW = Math.ceil(element.getBoundingClientRect().width);
    // 単一行維持では「今の本文幅」より窓／プレイヤー幅を優先
    const player = element.closest(".html5-video-player, .video-js");
    const playerW =
      player instanceof HTMLElement
        ? Math.ceil((player.clientWidth || player.getBoundingClientRect().width) * 0.92)
        : 0;
    const available = Math.max(
      winW > 12 ? winW - 12 : 0,
      playerW,
      // 窓が本文ぴったりでも、少し余白を見ておく
      selfW > 0 ? selfW + 24 : 0
    );
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
    if (forceReadable) {
      existing.segment.color = "#ffffff";
      existing.segment.textShadow = "none";
      existing.forceReadable = true;
    }
    return existing;
  }

  const captionWindow = element.closest(
    ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window"
  );
  const segmentStyle = captureNodeStyle(element);
  segmentStyle.backgroundColor = backgroundColor;
  segmentStyle.fontSize = fontSize;
  if (forceReadable) {
    segmentStyle.color = "#ffffff";
    segmentStyle.textShadow = "none";
  }

  const snapshot = {
    segmentFontSize: fontSize,
    segment: segmentStyle,
    window: captionWindow ? captureNodeStyle(captionWindow) : null,
    windowNode: captionWindow,
    backgroundColor,
    forceReadable
  };

  styleSnapshots.set(element, snapshot);
  return snapshot;
}

function applyBaseStyles(element, snapshot) {
  const fontSize = snapshot.segmentFontSize || snapshot.segment?.fontSize;
  if (fontSize && parseFontSizePx(fontSize) > 0) {
    element.style.setProperty("font-size", fontSize, "important");
  }
  if (snapshot.forceReadable || element.getAttribute("data-yt-furigana-readable") === "1") {
    element.style.setProperty("color", "#ffffff", "important");
    element.style.setProperty("fill", "#ffffff", "important");
    element.style.setProperty("text-shadow", "none", "important");
  } else {
    if (snapshot.segment?.color) {
      element.style.setProperty("color", snapshot.segment.color, "important");
    }
    if (snapshot.segment?.textShadow && snapshot.segment.textShadow !== "none") {
      element.style.setProperty("text-shadow", snapshot.segment.textShadow, "important");
    }
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

  // 透過の縁取り字幕は黒帯を塗らない
  if (!hasVisibleBackground(bg)) {
    element.style.setProperty("background-color", "transparent", "important");
  }

  // MV 歌詞: YouTube が height:52px 固定にするためルビが全部消える
  expandYouTubeCaptionWindow(element);

  // TVer: 親の overflow:hidden でルビ／本文が切れるのを防ぐ
  ensureTVerCaptionOverflow(element);
  liftTVerRubyCaption(element);

  for (const ruby of element.querySelectorAll("ruby")) {
    ruby.style.removeProperty("background-color");
    ruby.style.removeProperty("box-decoration-break");
    ruby.style.removeProperty("-webkit-box-decoration-break");
    const rt = ruby.querySelector("rt");
    if (rt) rt.style.removeProperty("background-color");
  }
}

/**
 * YouTube の caption-window は触りすぎると字幕自体が出なくなる。
 * ルビが切れないよう overflow だけ見えるようにする。
 * @param {HTMLElement} element
 */
export function expandYouTubeCaptionWindow(element) {
  if (typeof HTMLElement === "undefined") return;
  if (!(element instanceof HTMLElement)) return;

  const win = element.closest(".caption-window");
  if (!(win instanceof HTMLElement)) return;

  win.style.setProperty("overflow", "visible", "important");

  const text = win.querySelector(".captions-text");
  if (text instanceof HTMLElement) {
    text.style.setProperty("overflow", "visible", "important");
  }
  const line = win.querySelector(".caption-visual-line");
  if (line instanceof HTMLElement) {
    line.style.setProperty("overflow", "visible", "important");
  }

  // 単一行ロックで必要な幅を YouTube の書き戻し後も再適用
  const needed = Number.parseFloat(
    element.getAttribute(NEEDED_WIDTH_ATTR) ||
      win.querySelector?.(`[${NEEDED_WIDTH_ATTR}]`)?.getAttribute?.(NEEDED_WIDTH_ATTR) ||
      ""
  );
  if (needed > 0) {
    const player = element.closest(".html5-video-player");
    const maxW =
      player instanceof HTMLElement
        ? Math.floor(
            (player.clientWidth || player.getBoundingClientRect().width || needed) * 0.94
          )
        : needed;
    const width = Math.min(Math.ceil(needed) + 8, maxW > 0 ? maxW : Math.ceil(needed) + 8);
    win.style.setProperty("width", `${width}px`, "important");
    win.style.setProperty("max-width", "94%", "important");
  }
}

/**
 * 次行のルビ高さから、前行に必要な下余白 (px) を決める。
 * @param {number} nextRubyRoomPx
 * @param {{ minGapPx?: number, padPx?: number }} [options]
 */
export function computeTVerLineGapPx(
  nextRubyRoomPx,
  { minGapPx = 22, padPx = 10 } = {}
) {
  const room = Math.max(0, Number(nextRubyRoomPx) || 0);
  return Math.max(minGapPx, Math.ceil(room + padPx));
}

/**
 * 字幕スタックがプレイヤー下端をはみ出すとき、上へ逃がす量 (px)。
 * 上端もはみ出さないよう上限を掛ける。
 * @param {{ stackTop: number, stackBottom: number, safeTop: number, safeBottom: number }} box
 */
export function computeTVerViewportLiftPx({
  stackTop,
  stackBottom,
  safeTop,
  safeBottom
}) {
  const overflowBottom = stackBottom - safeBottom;
  if (!(overflowBottom > 0.5)) return 0;
  const maxLift = Math.max(0, stackTop - safeTop);
  return Math.min(Math.ceil(overflowBottom), Math.ceil(maxLift));
}

/**
 * Video.js 字幕ツリーの overflow を visible にそろえる。
 * @param {HTMLElement} element
 */
export function ensureTVerCaptionOverflow(element) {
  if (typeof HTMLElement === "undefined") return;
  if (!(element instanceof HTMLElement)) return;
  const display = element.closest(".vjs-text-track-display");
  if (!(display instanceof HTMLElement)) return;

  let node = element;
  while (node instanceof HTMLElement) {
    node.style.setProperty("overflow", "visible", "important");
    if (node === display) break;
    node = node.parentElement;
  }
}

/**
 * 1行分のルビ占有高さ（本文上に出る分）を実測。
 * padding-top 方式と、rt を上へ絶対配置する方式の両方に対応する。
 * @param {HTMLElement} line
 */
export function measureTVerRubyRoomPx(line) {
  if (typeof HTMLElement === "undefined") return 0;
  if (!(line instanceof HTMLElement)) return 0;

  let max = 0;
  for (const ruby of line.querySelectorAll("ruby")) {
    const rt = ruby.querySelector("rt");
    const pad = Number.parseFloat(getComputedStyle(ruby).paddingTop) || 0;
    const rtH = rt ? rt.getBoundingClientRect().height : 0;
    const floated = pad <= 0.5 && rtH > 0 ? rtH + 6 : rtH * 1.05;
    max = Math.max(max, pad, floated);
  }
  return max;
}

/**
 * 先頭の cue-line だけ負の margin で持ち上げる（旧・padding-top 方式向け）。
 * 現行 TVer は rt 絶対配置のため通常は使わないが、判定ヘルパとして残す。
 * @param {Element | null | undefined} cueLine
 * @param {ParentNode | null | undefined} display
 */
export function shouldLiftTVerCueLine(cueLine, display) {
  if (!cueLine || !display || typeof display.querySelectorAll !== "function") {
    return true;
  }
  const lines = Array.from(display.querySelectorAll(".vjs-text-track-cue-line"));
  if (lines.length <= 1) return true;
  return lines[0] === cueLine;
}

/**
 * TVer: 本文位置は変えず、負マージンによる持ち上げはしない。
 * （ルビは CSS で上に絶対配置。行間は fitTVerCaptionViewport が確保）
 * @param {HTMLElement} element
 */
export function liftTVerRubyCaption(element) {
  if (typeof HTMLElement === "undefined") return;
  if (!(element instanceof HTMLElement)) return;
  const display = element.closest(".vjs-text-track-display");
  if (!(display instanceof HTMLElement)) return;

  // 旧スタイルの負マージンが残っていたら消す
  element.style.removeProperty("margin-top");
  element.style.removeProperty("padding-bottom");
}

/** @type {WeakMap<Element, boolean>} */
const tverFitScheduled = new WeakMap();

/**
 * 同一 display への連打をまとめ、レイアウト確定後に実測フィットする。
 * @param {HTMLElement} element
 */
export function scheduleTVerCaptionFit(element) {
  if (typeof HTMLElement === "undefined") return;
  if (!(element instanceof HTMLElement)) return;
  const display = element.closest(".vjs-text-track-display");
  if (!(display instanceof HTMLElement)) return;
  if (tverFitScheduled.get(display)) return;
  tverFitScheduled.set(display, true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tverFitScheduled.delete(display);
      fitTVerCaptionViewport(display);
    });
  });
}

/** @type {WeakMap<Element, boolean>} */
const youtubeFitScheduled = new WeakMap();

/**
 * YouTube 字幕窓の見切れを実測して上へ逃がす（MV の長い歌詞行向け）。
 * @param {HTMLElement} element
 */
export function scheduleYouTubeCaptionFit(element) {
  if (typeof HTMLElement === "undefined") return;
  if (!(element instanceof HTMLElement)) return;
  const host =
    element.closest(".caption-window") ||
    element.closest(".ytp-caption-window-container") ||
    element.closest(".captions-text");
  if (!(host instanceof HTMLElement)) return;
  if (youtubeFitScheduled.get(host)) return;
  youtubeFitScheduled.set(host, true);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      youtubeFitScheduled.delete(host);
      fitYouTubeCaptionViewport(host);
    });
  });
}

/**
 * @param {HTMLElement} host caption-window など
 */
export function fitYouTubeCaptionViewport(host) {
  if (typeof HTMLElement === "undefined") return;
  if (!(host instanceof HTMLElement)) return;
  if (!host.isConnected) return;

  host.style.removeProperty("transform");
  host.style.removeProperty("--ytf-yt-lift");

  const styled = host.matches("[data-yt-furigana-styled]")
    ? [host]
    : Array.from(host.querySelectorAll("[data-yt-furigana-styled]"));
  const targets = styled.length
    ? styled
    : Array.from(
        host.querySelectorAll(".ytp-caption-segment, .caption-visual-line")
      );

  if (targets.length === 0) return;

  let stackTop = Infinity;
  let stackBottom = -Infinity;
  for (const node of targets) {
    if (!(node instanceof HTMLElement)) continue;
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 || rect.height > 0)) continue;
    stackTop = Math.min(stackTop, rect.top);
    stackBottom = Math.max(stackBottom, rect.bottom);
  }
  if (!Number.isFinite(stackTop) || !Number.isFinite(stackBottom)) return;

  // ルビ分の上余白もスタックに含める
  for (const node of targets) {
    if (!(node instanceof HTMLElement)) continue;
    for (const rt of node.querySelectorAll("rt")) {
      const rect = rt.getBoundingClientRect();
      stackTop = Math.min(stackTop, rect.top);
      stackBottom = Math.max(stackBottom, rect.bottom);
    }
  }

  const player =
    host.closest(".html5-video-player") ||
    host.closest(".ytp-fullscreen") ||
    document.querySelector(".html5-video-player");
  const playerRect =
    player instanceof HTMLElement
      ? player.getBoundingClientRect()
      : host.getBoundingClientRect();

  const safeTop = playerRect.top + 8;
  const safeBottom = playerRect.bottom - 16;
  const lift = computeTVerViewportLiftPx({
    stackTop,
    stackBottom,
    safeTop,
    safeBottom
  });

  if (lift > 0) {
    host.style.setProperty("--ytf-yt-lift", `${lift}px`);
    host.style.setProperty("transform", `translateY(-${lift}px)`, "important");
  }
}

/**
 * TVer / YouTube 共通の見切れ補正スケジュール。
 * @param {HTMLElement} element
 */
export function scheduleCaptionViewportFit(element) {
  scheduleTVerCaptionFit(element);
  scheduleYouTubeCaptionFit(element);
}

/**
 * TVer 字幕を実測して:
 * 本文位置は変えず（行間をルビ分だけ広げない）、
 * プレイヤー下端／シークバーに被る分だけスタックを上へ逃がす。
 * @param {HTMLElement} display
 */
export function fitTVerCaptionViewport(display) {
  if (typeof HTMLElement === "undefined") return;
  if (!(display instanceof HTMLElement)) return;
  if (!display.isConnected) return;
  if (!display.classList.contains("vjs-text-track-display")) {
    const found = display.closest?.(".vjs-text-track-display");
    if (!(found instanceof HTMLElement)) return;
    display = found;
  }

  ensureTVerCaptionOverflow(display);

  // 前回の持ち上げを外してから測る（二重適用防止）
  display.style.removeProperty("transform");
  display.style.removeProperty("--ytf-tver-lift");

  const lines = Array.from(
    display.querySelectorAll(".vjs-text-track-cue-line")
  ).filter((node) => node instanceof HTMLElement && node.getClientRects().length);

  // 旧: 次行ルビ分の margin-bottom で本文を下へ押していた → やめる
  for (const line of lines) {
    line.style.removeProperty("margin-bottom");
  }

  if (lines.length === 0) {
    display.style.removeProperty("transform");
    display.style.removeProperty("--ytf-tver-lift");
    return;
  }

  let stackTop = Infinity;
  let stackBottom = -Infinity;
  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    if (!(rect.width > 0 || rect.height > 0)) continue;
    stackTop = Math.min(stackTop, rect.top);
    stackBottom = Math.max(stackBottom, rect.bottom);
    for (const rt of line.querySelectorAll("rt")) {
      const rr = rt.getBoundingClientRect();
      if (!(rr.width > 0 || rr.height > 0)) continue;
      stackTop = Math.min(stackTop, rr.top);
      stackBottom = Math.max(stackBottom, rr.bottom);
    }
  }
  if (!Number.isFinite(stackTop) || !Number.isFinite(stackBottom)) return;

  const player =
    display.closest(".video-js") ||
    display.closest(".vjs-tech")?.parentElement ||
    display.parentElement;
  const playerRect =
    player instanceof HTMLElement
      ? player.getBoundingClientRect()
      : display.getBoundingClientRect();

  const safeTop = playerRect.top + 8;
  // コントロール／シークバー帯を避ける
  const safeBottom = playerRect.bottom - 72;
  const lift = computeTVerViewportLiftPx({
    stackTop,
    stackBottom,
    safeTop,
    safeBottom
  });

  if (lift > 0) {
    display.style.setProperty("--ytf-tver-lift", `${lift}px`);
    display.style.setProperty(
      "transform",
      `translateY(-${lift}px)`,
      "important"
    );
  } else {
    display.style.removeProperty("--ytf-tver-lift");
    display.style.removeProperty("transform");
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
    applyBaseStyles(element, snapshot);
    paintCaptionBackground(element, snapshot);
    // フォント確定後にルビ縦積みを適用（逆順だと余白計測がずれる）
    fitRubyReadings(element);
    scheduleCaptionViewportFit(element);
  });
}

export function startCaptionStyleGuard(element) {
  if (styleGuards.has(element)) return;

  const snapshot = styleSnapshots.get(element);
  if (!snapshot) return;

  let applying = false;
  const apply = () => {
    if (applying) return;
    if (!element.isConnected) {
      guard.disconnect();
      winGuard?.disconnect();
      styleGuards.delete(element);
      return;
    }
    applying = true;
    try {
      applyBaseStyles(element, snapshot);
      paintCaptionBackground(element, snapshot);
      expandYouTubeCaptionWindow(element);
      // YouTube が style を書き戻してもルビ縦積みを維持
      fitRubyReadings(element);
    } finally {
      queueMicrotask(() => {
        applying = false;
      });
    }
  };

  const guard = new MutationObserver(apply);
  guard.observe(element, { attributes: true, attributeFilter: ["style", "class"] });

  // YouTube が caption-window の height を毎フレーム書き戻す対策
  const win = element.closest(".caption-window");
  let winGuard = null;
  if (win instanceof HTMLElement) {
    winGuard = new MutationObserver(apply);
    winGuard.observe(win, { attributes: true, attributeFilter: ["style", "class"] });
  }

  styleGuards.set(element, {
    disconnect() {
      guard.disconnect();
      winGuard?.disconnect();
    }
  });
}

export function releaseCaptionStyles(element) {
  const guard = styleGuards.get(element);
  guard?.disconnect();
  styleGuards.delete(element);

  styleSnapshots.delete(element);
  element.removeAttribute("data-yt-furigana-styled");
  element.removeAttribute(LINE_WIDTH_ATTR);
  element.removeAttribute(KEEP_ONE_LINE_ATTR);
  element.removeAttribute(NEEDED_WIDTH_ATTR);
  element.removeAttribute("data-yt-furigana-outline");
  element.removeAttribute("data-yt-furigana-readable");
  element.removeAttribute(BACKGROUND_ATTR);

  const win = element.closest?.(".caption-window, .captions-text");
  if (win instanceof HTMLElement) {
    win.style.removeProperty("width");
    win.style.removeProperty("max-width");
    // overflow:visible は他キューでも害が少ないので残してよいが、幅は戻す
  }

  const line = element.closest?.(".vjs-text-track-cue-line");
  if (line instanceof HTMLElement) {
    line.style.removeProperty("margin-bottom");
    line.style.removeProperty("margin-top");
    line.style.removeProperty("padding-bottom");
    line.style.removeProperty("overflow");
  }

  for (const prop of [
    "font-size",
    "line-height",
    "color",
    "text-shadow",
    "background-color",
    "padding-top",
    "padding-bottom",
    "margin-top",
    "overflow",
    "white-space",
    "word-break",
    "line-break",
    "overflow-wrap",
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
