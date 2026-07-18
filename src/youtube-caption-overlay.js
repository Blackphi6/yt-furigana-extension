/**
 * YouTube のカラオケ／縁取り字幕は DOM を高頻度で差し替えるため、
 * 元字幕は常時隠し、プレイヤー上の「常駐」ルビ帯だけを更新する。
 *
 * カラオケの色変化で caption-window の矩形が揺れるので、
 * 同一行（textKey）では位置をロックして追従しない。
 */
import { fitRubyReadings } from "./ruby-layout.js";

const ROOT_ID = "yt-furigana-yt-overlay-root";
const LAYER_CLASS = "yt-furigana-yt-overlay";
const HIDDEN_ATTR = "data-yt-furigana-native-hidden";
const WINDOW_HIDDEN_ATTR = "data-yt-furigana-window-hidden";
const HIDE_NATIVE_DOC_ATTR = "data-yt-furigana-hide-native-captions";

/**
 * ネイティブ YouTube 字幕を CSS で常時隠す…は廃止。
 * 誤って残った属性だけ掃除し、二度と付けない。
 * @param {boolean} [_hidden]
 */
export function setYouTubeNativeCaptionHidden(_hidden = false) {
  if (typeof document === "undefined") return;
  document.documentElement.removeAttribute(HIDE_NATIVE_DOC_ATTR);
}

/**
 * @param {HTMLElement} element
 */
export function hideNativeYouTubeCaption(element) {
  // no-op: ネイティブ字幕は隠さない（全言語字幕消滅事故の再発防止）
  void element;
}

function hideAllNativeCaptionWindows() {
  // no-op
}

/**
 * @typedef {{
 *   html: string,
 *   textKey: string,
 *   fontPx: number,
 *   left: number,
 *   top: number,
 *   positionLocked: boolean,
 *   playerW: number,
 *   playerH: number,
 *   userPlaced?: boolean
 * }} StickyState
 */

/** @type {StickyState | null} */
let sticky = null;
let emptyFrames = 0;
let hideTick = 0;
const HIDE_EVERY_N_FRAMES = 4;
const RESIZE_SLACK_PX = 12;
/** 字幕が長く消えたときだけ隠す（行間の一瞬消しはジャンプ感の原因） */
const EMPTY_HIDE_FRAMES = 180; // ~3s @60fps
const DRAG_THRESHOLD_PX = 5;

/** @type {{
 *   pointerId: number,
 *   startX: number,
 *   startY: number,
 *   origLeft: number,
 *   origTop: number,
 *   dragging: boolean,
 *   player: HTMLElement
 * } | null} */
let dragState = null;

function ensureRoot(player) {
  let root = document.getElementById(ROOT_ID);
  if (root && player.contains(root)) return root;
  root?.remove();
  root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "35",
    overflow: "visible"
  });
  player.appendChild(root);
  return root;
}

function ensureLayer(root) {
  let layer = root.querySelector(`.${LAYER_CLASS}`);
  if (layer instanceof HTMLElement) {
    // Stylus の .ytp-caption-segment 指定がそのまま当たるようにする
    layer.classList.add("ytp-caption-segment");
    const player = root.parentElement;
    if (player instanceof HTMLElement) installOverlayDrag(layer, player);
    return layer;
  }
  layer = document.createElement("div");
  // yt-furigana-yt-overlay: 自前スタイル
  // ytp-caption-segment: ユーザー Stylus 等の既存ルールを流用
  layer.className = `${LAYER_CLASS} ytp-caption-segment`;
  root.appendChild(layer);
  const player = root.parentElement;
  if (player instanceof HTMLElement) installOverlayDrag(layer, player);
  return layer;
}

/**
 * YouTube 標準の「字幕をドラッグして移動」相当。
 * クリック学習と両立するため、数 px 動いてからドラッグ開始。
 * @param {HTMLElement} layer
 * @param {HTMLElement} player
 */
function installOverlayDrag(layer, player) {
  if (layer.dataset.ytFuriganaDragBound === "1") return;
  layer.dataset.ytFuriganaDragBound = "1";
  layer.style.cursor = "grab";
  layer.style.touchAction = "none";
  layer.setAttribute("title", "ドラッグで字幕の位置を移動");

  layer.addEventListener("pointerdown", (event) => {
    if (!(event instanceof PointerEvent)) return;
    if (event.button != null && event.button !== 0) return;
    if (!sticky) return;
    // 読みピッカー操作中はドラッグしない
    if (
      event.target instanceof Element &&
      event.target.closest(".yt-furigana-picker, .yt-furigana-word")
    ) {
      // 単語クリックは許可。帯の余白ドラッグ用に word 以外も…
      // word 上でも閾値超えなら移動したいので、ここではブロックしない
    }
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origLeft: sticky.left,
      origTop: sticky.top,
      dragging: false,
      player
    };
  });

  layer.addEventListener("pointermove", (event) => {
    if (!(event instanceof PointerEvent) || !dragState) return;
    if (event.pointerId !== dragState.pointerId || !sticky) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragState.dragging = true;
      try {
        layer.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      layer.style.cursor = "grabbing";
      // フェード中でも位置は即反映
      layer.style.transition = "none";
    }

    event.preventDefault();
    event.stopPropagation();

    const playerRect = dragState.player.getBoundingClientRect();
    let left = dragState.origLeft + dx;
    let top = dragState.origTop + dy;
    left = Math.min(
      Math.max(left, playerRect.width * 0.06),
      playerRect.width * 0.94
    );
    top = Math.min(Math.max(top, 8), playerRect.height * 0.9);

    sticky.left = left;
    sticky.top = top;
    sticky.positionLocked = true;
    sticky.userPlaced = true;
    sticky.playerW = playerRect.width;
    sticky.playerH = playerRect.height;
    applyLayerCoords(layer, left, top);
  });

  const endDrag = (event) => {
    if (!dragState || !(event instanceof PointerEvent)) return;
    if (event.pointerId !== dragState.pointerId) return;
    const wasDragging = dragState.dragging;
    dragState = null;
    layer.style.cursor = "grab";
    try {
      layer.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (wasDragging) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  layer.addEventListener("pointerup", endDrag);
  layer.addEventListener("pointercancel", endDrag);
}

function resolvePlayer(element) {
  return (
    element?.closest?.(".html5-video-player") ||
    document.querySelector(".html5-video-player")
  );
}

/**
 * @param {HTMLElement} player
 * @param {HTMLElement | null} [segment]
 */
function resolveOverlayFontPx(player, segment) {
  const playerH = player.getBoundingClientRect().height || 720;
  const fromPlayer = Math.round(playerH * 0.048);
  const fromSeg = segment
    ? Number.parseFloat(getComputedStyle(segment).fontSize) || 0
    : 0;
  return Math.max(30, fromPlayer, fromSeg);
}

/**
 * ネイティブ字幕を確実に再表示する。
 * 拡張が付けた非表示（important の opacity/visibility 含む）を掃除。
 */
export function restoreYouTubeNativeCaptionsVisible() {
  if (typeof document === "undefined") return;
  setYouTubeNativeCaptionHidden(false);
  for (const el of document.querySelectorAll(
    `.html5-video-player .caption-window, .html5-video-player .captions-text, .html5-video-player .caption-visual-line, .html5-video-player .ytp-caption-segment:not(.yt-furigana-yt-overlay), [${HIDDEN_ATTR}], [${WINDOW_HIDDEN_ATTR}]`
  )) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("#yt-furigana-yt-overlay-root")) continue;
    const marked =
      el.hasAttribute(HIDDEN_ATTR) || el.hasAttribute(WINDOW_HIDDEN_ATTR);
    const forcedHide =
      el.style.getPropertyPriority("opacity") === "important" ||
      el.style.getPropertyPriority("visibility") === "important";
    if (!marked && !forcedHide) continue;
    el.style.removeProperty("opacity");
    el.style.removeProperty("visibility");
    if (marked || el.style.color === "transparent") {
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("fill");
    }
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(WINDOW_HIDDEN_ATTR);
  }
}

/**
 * @param {HTMLElement} element
 */
export function showNativeYouTubeCaption(element) {
  if (!(element instanceof HTMLElement)) return;
  const nodes = [
    element,
    element.closest(".caption-visual-line"),
    element.closest(".captions-text"),
    element.closest(".caption-window")
  ];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (!node.hasAttribute(HIDDEN_ATTR) && !node.hasAttribute(WINDOW_HIDDEN_ATTR)) {
      continue;
    }
    node.style.removeProperty("opacity");
    node.style.removeProperty("color");
    node.style.removeProperty("visibility");
    node.removeAttribute(HIDDEN_ATTR);
    node.removeAttribute(WINDOW_HIDDEN_ATTR);
  }
}

const DEFAULT_OVERLAY_FONT =
  '"YouTube Noto", Roboto, Arial, Helvetica, Verdana, "PT Sans Caption", sans-serif';

/**
 * Stylus 等が .ytp-caption-segment に指定したフォントをオーバーレイへ引き継ぐ。
 * @param {HTMLElement | null | undefined} segment
 */
function resolveCaptionFontFamily(segment) {
  if (!(segment instanceof HTMLElement)) return DEFAULT_OVERLAY_FONT;
  try {
    const family = getComputedStyle(segment).fontFamily;
    if (family && family.trim() && family !== "inherit") return family;
  } catch {
    /* ignore */
  }
  return DEFAULT_OVERLAY_FONT;
}

/**
 * @param {HTMLElement | null | undefined} segment
 */
function resolveCaptionFontWeight(segment) {
  if (!(segment instanceof HTMLElement)) return "500";
  try {
    const weight = getComputedStyle(segment).fontWeight;
    if (weight && weight.trim()) return weight;
  } catch {
    /* ignore */
  }
  return "500";
}

/**
 * @param {HTMLElement} layer
 * @param {number} fontPx
 * @param {HTMLElement | null} [segment]
 */
function paintLayerStyles(layer, fontPx, segment = null) {
  Object.assign(layer.style, {
    position: "absolute",
    pointerEvents: "auto",
    boxSizing: "border-box",
    width: "max-content",
    maxWidth: "90%",
    minWidth: "0",
    padding: "0.45em 0.7em 0.35em",
    borderRadius: "6px",
    background: "rgba(8, 8, 8, 0.82)",
    color: "#fff",
    textShadow: "none",
    fill: "#fff",
    // Stylus の .ytp-caption-segment { font-family: ... } を反映
    fontFamily: resolveCaptionFontFamily(segment),
    fontWeight: resolveCaptionFontWeight(segment),
    fontSize: `${fontPx}px`,
    lineHeight: "1.45",
    textAlign: "center",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    lineBreak: "strict",
    overflowWrap: "break-word",
    overflow: "visible",
    zIndex: "36",
    transform: "translate(-50%, 0)"
  });
}

/**
 * @param {HTMLElement} layer
 * @param {number} left
 * @param {number} top
 */
function applyLayerCoords(layer, left, top) {
  layer.style.left = `${left}px`;
  layer.style.top = `${top}px`;
}

/**
 * @param {DOMRectReadOnly} playerRect
 * @param {HTMLElement} player
 * @param {HTMLElement | null} segment
 * @param {HTMLElement | null} [layer]
 */
function measureAnchor(playerRect, player, segment, layer = null) {
  const win =
    (segment &&
      (segment.closest(".caption-window") ||
        segment.closest(".ytp-caption-window-container"))) ||
    document.querySelector(".caption-window");

  let left = playerRect.width / 2;
  // 既定は下部だが、コントロール帯より上に置く
  let top = playerRect.height * 0.7;
  let ok = false;
  const fontPx = sticky?.fontPx || 30;

  if (win instanceof HTMLElement) {
    const rect = win.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      left = rect.left - playerRect.left + rect.width / 2;
      // ルビ帯ぶん上へ。caption-window がコントロール付近でも被らないよう多めに逃がす
      top = rect.top - playerRect.top - fontPx * 1.15;
      ok = true;
    }
  } else if (segment instanceof HTMLElement) {
    const rect = segment.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      left = rect.left - playerRect.left + rect.width / 2;
      top = rect.top - playerRect.top - fontPx * 1.15;
      ok = true;
    }
  }

  left = Math.min(Math.max(left, playerRect.width * 0.08), playerRect.width * 0.92);
  top = clampTopAboveControls(top, player, playerRect, layer);
  return { left, top, ok };
}

/**
 * YouTube 下部コントロール（再生バー含む）の高さ＋余白。
 * @param {HTMLElement} player
 * @param {DOMRectReadOnly} playerRect
 */
function resolveControlsClearancePx(player, playerRect) {
  const fallback = Math.max(96, Math.round(playerRect.height * 0.14));
  // クリアランス过大だと maxTop≈0 になり字幕が画面上端へ飛ぶ
  const maxClearance = Math.round(playerRect.height * 0.26);
  let measured = fallback;

  const chrome = player.querySelector(".ytp-chrome-bottom");
  if (chrome instanceof HTMLElement) {
    const cr = chrome.getBoundingClientRect();
    const fromBottom = playerRect.bottom - cr.top;
    if (fromBottom > 36 && fromBottom < playerRect.height * 0.45) {
      measured = Math.max(measured, Math.ceil(fromBottom + 18));
    }
  }
  const progress = player.querySelector(
    ".ytp-progress-bar-container, .ytp-progress-bar"
  );
  if (progress instanceof HTMLElement) {
    const pr = progress.getBoundingClientRect();
    const fromBottom = playerRect.bottom - pr.top;
    if (fromBottom > 20 && fromBottom < playerRect.height * 0.4) {
      measured = Math.max(measured, Math.ceil(fromBottom + 24));
    }
  }
  return Math.min(measured, maxClearance);
}

/**
 * オーバーレイ下端がコントロールに被らないよう top を抑える。
 * 画面上半分より上（top が小さすぎる）には絶対に出さない。
 */
function clampTopAboveControls(top, player, playerRect, layer = null) {
  const clearance = resolveControlsClearancePx(player, playerRect);
  const layerH =
    (layer instanceof HTMLElement && layer.getBoundingClientRect().height) ||
    (sticky?.fontPx || 30) * 2.6;
  const minTop = playerRect.height * 0.48;
  let maxTop = playerRect.height - clearance - layerH;
  if (!(maxTop >= minTop)) {
    maxTop = Math.max(minTop, playerRect.height * 0.62);
  }
  return Math.min(Math.max(top, minTop), maxTop);
}

/**
 * 縦にはみ出す時だけ最小限フォントを縮めて必ず枠内へ収める。
 * （通常は縮めない＝ユーザー要望「文字を小さくするのは禁物」を尊重）
 * @param {HTMLElement} layer
 * @param {HTMLElement} player
 * @param {number} baseFontPx
 * @returns {number} 実際に適用したフォント px
 */
function fitOverlayWithinFrame(layer, player, baseFontPx) {
  const playerRect = player.getBoundingClientRect();
  if (!(playerRect.height > 0)) return baseFontPx;

  const clearance = resolveControlsClearancePx(player, playerRect);
  const topMargin = Math.max(8, playerRect.height * 0.04);
  const availableH = playerRect.height - clearance - topMargin;
  if (!(availableH > 0)) return baseFontPx;

  // まず基準サイズに戻してから測る（縮めっぱなしで戻らないのを防ぐ）
  layer.style.fontSize = `${baseFontPx}px`;
  const h = layer.getBoundingClientRect().height;
  if (h <= availableH) return baseFontPx;

  const scale = Math.max(0.5, availableH / h);
  const fitted = Math.max(14, Math.round(baseFontPx * scale));
  layer.style.fontSize = `${fitted}px`;
  return fitted;
}

/**
 * ルビ整形 → 枠内フィット → 下端アンカーをまとめて実行する。
 * どんなに長い字幕でも必ず動画枠内に収める。
 * @param {HTMLElement} layer
 * @param {HTMLElement} player
 * @param {HTMLElement | null} segment
 * @param {{ reanchor?: boolean }} [opts]
 */
function refitOverlay(layer, player, segment, { reanchor = true } = {}) {
  const playerRect = player.getBoundingClientRect();
  if (!(playerRect.width > 0 && playerRect.height > 0)) return;

  fitRubyReadings(layer);
  const base = resolveOverlayFontPx(player, segment);
  const fitted = fitOverlayWithinFrame(layer, player, base);
  if (sticky) sticky.fontPx = fitted;
  // フォントを変えたらルビ余白も測り直す
  if (fitted !== base) fitRubyReadings(layer);

  if (reanchor && sticky) {
    const clearance = resolveControlsClearancePx(player, playerRect);
    const topMargin = Math.max(8, playerRect.height * 0.04);
    const layerH = layer.getBoundingClientRect().height || fitted * 2.6;
    let top = playerRect.height - clearance - layerH;
    if (top < topMargin) top = topMargin;
    sticky.top = top;
    sticky.left =
      sticky.userPlaced && sticky.left > 0 ? sticky.left : playerRect.width / 2;
    sticky.positionLocked = true;
    sticky.playerW = playerRect.width;
    sticky.playerH = playerRect.height;
  }
  if (sticky) applyLayerCoords(layer, sticky.left, sticky.top);
}

/**
 * 行が変わったとき／プレイヤーリサイズ時だけ計測し直す。
 * カラオケ色変化のたびに caption-window を追うとガタつく。
 * @param {HTMLElement} layer
 * @param {HTMLElement} player
 * @param {HTMLElement | null} segment
 * @param {{ force?: boolean }} [opts]
 */
function positionStickyLayer(layer, player, segment, { force = false } = {}) {
  const playerRect = player.getBoundingClientRect();
  if (!(playerRect.width > 0 && playerRect.height > 0)) return;

  if (sticky?.positionLocked && !force) {
    applyLayerCoords(layer, sticky.left, sticky.top);
    return;
  }

  const measured = measureAnchor(playerRect, player, segment, layer);
  // 計測不能なら前回座標を維持（クランプで上へ動かさない）
  if (!measured.ok && sticky && sticky.left > 0) {
    applyLayerCoords(layer, sticky.left, sticky.top);
    sticky.positionLocked = true;
    return;
  }

  if (sticky) {
    sticky.left = measured.left;
    sticky.top = measured.top;
    sticky.playerW = playerRect.width;
    sticky.playerH = playerRect.height;
    sticky.positionLocked = true;
  }

  applyLayerCoords(layer, measured.left, measured.top);
}

function playerResized(player) {
  if (!sticky) return false;
  const rect = player.getBoundingClientRect();
  return (
    Math.abs(rect.width - sticky.playerW) > RESIZE_SLACK_PX ||
    Math.abs(rect.height - sticky.playerH) > RESIZE_SLACK_PX
  );
}

/**
 * @param {HTMLElement} segment
 * @param {string} furiganaHtml
 * @param {string} [textKey]
 */
export function applyYouTubeFuriganaOverlay(segment, furiganaHtml, textKey = "") {
  if (!(segment instanceof HTMLElement) || !furiganaHtml) return;
  const player = resolvePlayer(segment);
  if (!(player instanceof HTMLElement)) return;

  // 最初の適用時点でもネイティブは隠さない
  setYouTubeNativeCaptionHidden(false);

  const root = ensureRoot(player);
  const layer = ensureLayer(root);
  const fontPx = resolveOverlayFontPx(player, segment);
  const key = textKey || furiganaHtml;
  const prev = sticky;
  const sameLine = Boolean(prev && prev.textKey === key);
  const contentChanged = !prev || prev.html !== furiganaHtml;
  const resized = Boolean(prev && playerResized(player));
  // 一度決めた縦位置／ユーザー配置は字幕切替でも維持
  const keepAnchor = Boolean(
    prev &&
      prev.positionLocked &&
      prev.top > 0 &&
      prev.left > 0 &&
      (!resized || prev.userPlaced)
  );

  let nextLeft = keepAnchor ? prev.left : prev?.left ?? 0;
  let nextTop = keepAnchor ? prev.top : prev?.top ?? 0;
  if (resized && prev?.userPlaced && prev.playerW > 0 && prev.playerH > 0) {
    const rect = player.getBoundingClientRect();
    nextLeft = prev.left * (rect.width / prev.playerW);
    nextTop = prev.top * (rect.height / prev.playerH);
  }

  sticky = {
    html: furiganaHtml,
    textKey: key,
    fontPx: sameLine && prev ? prev.fontPx : fontPx,
    left: nextLeft,
    top: nextTop,
    positionLocked: keepAnchor,
    playerW: prev?.playerW ?? 0,
    playerH: prev?.playerH ?? 0,
    userPlaced: Boolean(prev?.userPlaced)
  };
  emptyFrames = 0;

  hideAllNativeCaptionWindows();
  hideNativeYouTubeCaption(segment);

  if (!sameLine || contentChanged) {
    paintLayerStyles(layer, sticky.fontPx, segment);
    const playerW = player.getBoundingClientRect().width;
    if (playerW > 0) {
      layer.setAttribute(
        "data-yt-furigana-line-width",
        String(Math.floor(playerW * 0.88))
      );
    }
  } else {
    // 同一行でも Stylus 等のフォント変更を拾えるよう再同期
    layer.style.fontFamily = resolveCaptionFontFamily(segment);
    layer.style.fontWeight = resolveCaptionFontWeight(segment);
  }

  if (keepAnchor) {
    applyLayerCoords(layer, sticky.left, sticky.top);
  } else {
    sticky.positionLocked = false;
    positionStickyLayer(layer, player, segment, { force: true });
  }

  if (contentChanged) {
    layer.innerHTML = furiganaHtml;
    layer.setAttribute("data-yt-furigana-html", furiganaHtml);
    layer.style.opacity = "1";

    // ユーザーがドラッグ配置した時だけ位置は維持。それ以外は下端アンカーで再配置。
    const reanchor = !sticky.userPlaced;
    requestAnimationFrame(() => {
      if (!sticky || sticky.html !== furiganaHtml) return;
      refitOverlay(layer, player, segment, { reanchor });
    });
  }

  startYouTubeOverlayPositionLoop();
}

/**
 * ネイティブ再隠し＋ロック位置の再適用のみ。毎フレーム計測しない。
 * ※ fitRuby 後の inline style 付き innerHTML と sticky.html を比較して
 *   毎フレーム差し戻すと余白が消えてふりがなが重なるため、内容キーで判定する。
 */
export function refreshYouTubeFuriganaOverlays() {
  const root = document.getElementById(ROOT_ID);
  if (!root || !sticky) return;

  const player = root.parentElement;
  if (!(player instanceof HTMLElement)) return;

  const segment =
    document.querySelector(
      ".ytp-caption-segment:not(.yt-furigana-yt-overlay)"
    ) || document.querySelector(".caption-visual-line");
  const hasCaptionChrome = Boolean(
    document.querySelector(".caption-window") || segment
  );

  if (!hasCaptionChrome) {
    emptyFrames += 1;
    // 行間は直前の字幕を同じ位置のまま残す（消えて下から出直すのを防ぐ）
    if (emptyFrames > EMPTY_HIDE_FRAMES) {
      root.style.opacity = "0";
      return;
    }
  } else {
    emptyFrames = 0;
    root.style.opacity = "1";
    // CSS で隠しているので毎フレームの JS hide は不要。保険でたまにだけ。
    hideTick += 1;
    if (hideTick % 30 === 0) {
      hideAllNativeCaptionWindows();
      if (segment instanceof HTMLElement) hideNativeYouTubeCaption(segment);
    }
  }

  const layer = ensureLayer(root);
  // 内容の差し替えは applyYouTubeFuriganaOverlay 側で行う

  if (playerResized(player)) {
    sticky.positionLocked = false;
    // リサイズ時もフォント基準を測り直して枠内に収める
    refitOverlay(
      layer,
      player,
      segment instanceof HTMLElement ? segment : null,
      { reanchor: !sticky.userPlaced }
    );
    return;
  }

  applyLayerCoords(layer, sticky.left, sticky.top);
}

export function clearYouTubeFuriganaOverlays() {
  if (typeof document === "undefined") return;
  dragState = null;
  sticky = null;
  emptyFrames = 0;
  hideTick = 0;
  setYouTubeNativeCaptionHidden(false);
  stopYouTubeOverlayPositionLoop();
  document.getElementById(ROOT_ID)?.remove();
  for (const el of document.querySelectorAll(
    `[${HIDDEN_ATTR}], [${WINDOW_HIDDEN_ATTR}]`
  )) {
    if (!(el instanceof HTMLElement)) continue;
    el.style.removeProperty("opacity");
    el.style.removeProperty("color");
    el.style.removeProperty("visibility");
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(WINDOW_HIDDEN_ATTR);
  }
}

/**
 * 再生時刻に該当キューが無いとき、sticky の古い字幕を即消す。
 * （シーク後に次の行が残る問題の対策）
 */
export function blankYouTubeFuriganaOverlay() {
  sticky = null;
  emptyFrames = 0;
  const root = document.getElementById(ROOT_ID);
  if (!(root instanceof HTMLElement)) return;
  root.style.opacity = "0";
  const layer = root.querySelector(`.${LAYER_CLASS}`);
  if (layer instanceof HTMLElement) {
    layer.innerHTML = "";
    layer.removeAttribute("data-yt-furigana-html");
  }
}

let overlayRaf = 0;
export function startYouTubeOverlayPositionLoop() {
  if (overlayRaf) return;
  const tick = () => {
    overlayRaf = 0;
    refreshYouTubeFuriganaOverlays();
    if (document.getElementById(ROOT_ID) && sticky) {
      overlayRaf = requestAnimationFrame(tick);
    }
  };
  overlayRaf = requestAnimationFrame(tick);
}

export function stopYouTubeOverlayPositionLoop() {
  if (overlayRaf) cancelAnimationFrame(overlayRaf);
  overlayRaf = 0;
}
