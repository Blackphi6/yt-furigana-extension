/** 読みの字間を詰める下限。0 = 詰めない（潰れて重なって見えるのを防ぐ） */
export const MAX_RT_TIGHTEN_EM = 0;

/** 1行に収まらない一塊のためのフォント縮小下限（複数行キュー向け） */
export const MIN_CAPTION_SCALE = 0.72;

/**
 * 注入前に単一行だった字幕を1行のまま枠に収めるときの縮小下限。
 * 折り返しは禁止なので、複数行向けより低くしてでも1行を守る。
 */
export const MIN_KEEP_ONE_LINE_SCALE = 0.55;

/** 注入前に単一行だったことを示す（折り返し禁止） */
export const KEEP_ONE_LINE_ATTR = "data-yt-furigana-keep-one-line";

/** 単一行ロック用ラッパ */
export const ONE_LINE_CLASS = "yt-furigana-one-line";

/** 隣接ギャップの下限 / 上限（px）— 触れる直前まで詰める */
export const RUBY_READING_GAP_MIN_PX = 1;
export const RUBY_READING_GAP_MAX_PX = 4;

/** @deprecated 互換用。密度ベースの既定上限 */
export const RUBY_READING_GAP_PX = RUBY_READING_GAP_MAX_PX;

/** 重なり分離の最大反復回数 */
export const RUBY_SEPARATE_MAX_PASSES = 8;

/** ルビ下端〜本文上端のすき間（px）。詰めて読みやすく */
export const RUBY_RT_CLEARANCE_PX = 3;

/** 漢字インクのはみ出し分（本文 font-size 比） */
export const RUBY_BASE_OVERFLOW_EM = 0.12;

/**
 * ルビ用 padding-top（px）。旧 absolute 配置用。flex でも下限の目安に使う。
 * @param {{ rtHeightPx: number, rtFontSizePx?: number, baseFontSizePx?: number }} input
 */
export function computeRubyPadTopPx({
  rtHeightPx,
  rtFontSizePx = 12,
  baseFontSizePx = 16
}) {
  const rtH = Math.max(0, Number(rtHeightPx) || 0);
  const rtFs = Math.max(1, Number(rtFontSizePx) || 12);
  const baseFs = Math.max(1, Number(baseFontSizePx) || 16);
  const fromRt = Math.ceil(rtH + RUBY_RT_CLEARANCE_PX + baseFs * RUBY_BASE_OVERFLOW_EM);
  const fromFs = Math.ceil(rtFs * 1.15);
  return Math.max(fromRt, fromFs);
}

/**
 * ruby 内の本文を .yt-furigana-rb で包む（flex/grid で rt を上に確実に載せるため）。
 * @param {HTMLElement} ruby
 * @param {HTMLElement} rt
 */
export function ensureRubyBaseWrapper(ruby, rt) {
  if (!(ruby instanceof HTMLElement) || !(rt instanceof HTMLElement)) return null;
  const existing = ruby.querySelector(":scope > .yt-furigana-rb");
  if (existing instanceof HTMLElement) return existing;

  const rb = document.createElement("span");
  rb.className = "yt-furigana-rb";
  const toMove = [];
  for (const node of Array.from(ruby.childNodes)) {
    if (node === rt) continue;
    if (node instanceof HTMLElement && node.tagName === "RT") continue;
    toMove.push(node);
  }
  for (const node of toMove) rb.appendChild(node);
  ruby.insertBefore(rb, rt);
  return rb;
}

/**
 * 本文1文字あたりの読み文字数（density）に応じた隣接ギャップ。
 * 長読みほど少しだけ空けるが、上限は小さめ（余白の食いすぎ防止）。
 * @param {number} rtLength
 * @param {number} baseLength
 * @param {number} [rtFontSizePx]
 */
export function computeRubyNeighborGapPx(
  rtLength,
  baseLength,
  rtFontSizePx = 12
) {
  const base = Math.max(1, Number(baseLength) || 1);
  const reading = Math.max(0, Number(rtLength) || 0);
  const density = reading / base;
  if (!(density > 1.2)) {
    return RUBY_READING_GAP_MIN_PX;
  }
  const overflow = density - 1;
  const px = overflow * (Number(rtFontSizePx) || 12) * 0.1;
  return Math.min(
    RUBY_READING_GAP_MAX_PX,
    Math.max(RUBY_READING_GAP_MIN_PX, Math.round(px))
  );
}

/**
 * @deprecated 文字サイズ縮小は行わない（常に 1）。
 * @param {number} _rtLength
 * @param {number} _baseLength
 */
export function computeRubyRtFontScale(_rtLength, _baseLength) {
  return 1;
}

/**
 * @param {{
 *   rubyWidth: number,
 *   rtNaturalWidth: number,
 *   rtLength: number,
 *   baseLength: number,
 *   rtFontSizePx: number,
 *   neighborGapPx?: number
 * }} input
 *
 * 方針（余白を食いすぎない）:
 * - 各 ruby を読み全幅まで広げない（それが「くれない」前後の大空白の原因だった）
 * - 本文は自然幅のまま。読みは absolute で中央寄せし、はみ出しは許容
 * - 隣接する読み同士が実測で重なるときだけ separateOverlapping で最小限離す
 * - 字間詰め・文字サイズ縮小はしない
 */
export function computeRubyFit({
  rubyWidth,
  rtNaturalWidth,
  rtLength,
  baseLength,
  rtFontSizePx,
  neighborGapPx
}) {
  const empty = {
    rtLetterSpacingPx: 0,
    baseLetterSpacingPx: 0,
    paddingInlinePx: 0,
    minWidthPx: null,
    rtScaleX: 1
  };

  // 事前拡張はしない。互換のため引数は受け取るだけ。
  void rubyWidth;
  void rtNaturalWidth;
  void rtLength;
  void baseLength;
  void rtFontSizePx;
  void neighborGapPx;
  return empty;
}

/**
 * 余白付き本文が枠より広いとき、全体フォントを何倍にすれば1行に収まるか。
 * @param {number} contentWidth
 * @param {number} availableWidth
 * @param {{ minScale?: number }} [options]
 */
export function computeLineShrinkScale(
  contentWidth,
  availableWidth,
  { minScale = MIN_CAPTION_SCALE } = {}
) {
  if (!(contentWidth > 0) || !(availableWidth > 0)) return 1;
  if (contentWidth <= availableWidth + 1) return 1;
  return Math.max(minScale, (availableWidth / contentWidth) * 0.985);
}

/**
 * テキストの視覚行数（Range の clientRects を top でクラスタ）。
 * レイアウト未計測環境では 1 を返す。
 * @param {Element} element
 * @returns {number}
 */
export function countCaptionTextLines(element) {
  if (!(element instanceof Element)) return 1;
  try {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1
    );
    if (rects.length === 0) {
      const box = element.getBoundingClientRect?.();
      if (!box || !(box.height > 0)) return 1;
      const style =
        typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
      const fontPx = Number.parseFloat(style?.fontSize) || 16;
      const lhRaw = style?.lineHeight;
      const linePx =
        lhRaw && lhRaw !== "normal" ? Number.parseFloat(lhRaw) || fontPx * 1.2 : fontPx * 1.2;
      return box.height > linePx * 1.75 ? 2 : 1;
    }
    const tops = [];
    for (const r of rects) {
      const slack = Math.max(3, r.height * 0.35);
      if (!tops.some((t) => Math.abs(t - r.top) <= slack)) tops.push(r.top);
    }
    return Math.max(1, tops.length);
  } catch {
    return 1;
  }
}

/**
 * @param {number} lineCount
 * @returns {boolean}
 */
export function shouldKeepCaptionOneLine(lineCount) {
  return Number(lineCount) <= 1;
}

/**
 * 単一行維持のためのフォントサイズ（px）と、下限でも足りないときの窓広げ要否。
 * @param {{
 *   contentWidth: number,
 *   availableWidth: number,
 *   baseFontPx: number,
 *   minScale?: number
 * }} input
 */
export function planKeepOneLineFit({
  contentWidth,
  availableWidth,
  baseFontPx,
  minScale = MIN_KEEP_ONE_LINE_SCALE
}) {
  const base = Math.max(1, Number(baseFontPx) || 16);
  const scale = computeLineShrinkScale(contentWidth, availableWidth, { minScale });
  const fittedWidth = contentWidth * scale;
  return {
    scale,
    fontSizePx: base * scale,
    needsWiden: fittedWidth > availableWidth + 1.5
  };
}

/**
 * 注入前の単一行フラグを属性に残す（既に判定済みなら触らない）。
 * YouTube/TVer の1セグメントは通常1行。<br>/改行が無ければ keep する
 * （ルビ残留や高さ誤判定で soft-break が入り「2行→3行」になるのを防ぐ）。
 * @param {HTMLElement} element
 */
export function markKeepOneLineCaption(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute(KEEP_ONE_LINE_ATTR)) {
    return element.getAttribute(KEEP_ONE_LINE_ATTR) === "1";
  }

  const original = element.getAttribute("data-yt-furigana-original");
  const probeSource =
    original != null ? original : String(element.textContent || "");
  const hasExplicitBreak =
    Boolean(element.querySelector?.("br")) || /[\n\r]/.test(probeSource);
  const looksLikeCaptionSegment = Boolean(
    element.matches?.(
      ".ytp-caption-segment, .caption-visual-line, .vjs-text-track-cue-line > span, .vjs-text-track-cue-line"
    ) || element.closest?.(".caption-window, .vjs-text-track-display")
  );

  // 明示改行が無い字幕セグメントは1行ロック（残留ルビがあっても ORIGINAL 優先）
  if (!hasExplicitBreak && looksLikeCaptionSegment) {
    if (
      original != null ||
      !element.querySelector?.("ruby, .yt-furigana-one-line")
    ) {
      element.setAttribute(KEEP_ONE_LINE_ATTR, "1");
      return true;
    }
  }

  // 既にルビ注入済みで ORIGINAL も無いなら「今の行数」で判定すると誤る
  if (
    element.getAttribute("data-yt-furigana-styled") === "1" ||
    element.querySelector?.("ruby, .yt-furigana-one-line")
  ) {
    element.setAttribute(KEEP_ONE_LINE_ATTR, "0");
    return false;
  }
  const keep = shouldKeepCaptionOneLine(countCaptionTextLines(element));
  element.setAttribute(KEEP_ONE_LINE_ATTR, keep ? "1" : "0");
  return keep;
}

/**
 * @param {string} html
 * @returns {string}
 */
export function wrapKeepOneLineHtml(html) {
  const body = String(html || "");
  if (!body) return body;
  if (body.includes(`class="${ONE_LINE_CLASS}"`) || body.includes(`class='${ONE_LINE_CLASS}'`)) {
    return body;
  }
  return `<span class="${ONE_LINE_CLASS}">${body}</span>`;
}

/**
 * @param {HTMLElement} host
 * @returns {boolean}
 */
export function isKeepOneLineCaption(host) {
  return (
    host instanceof HTMLElement && host.getAttribute(KEEP_ONE_LINE_ATTR) === "1"
  );
}

function rubyBaseText(ruby, rt) {
  const full = ruby.textContent || "";
  const reading = rt.textContent || "";
  if (!reading) return full;
  const idx = full.lastIndexOf(reading);
  if (idx >= 0 && idx + reading.length === full.length) {
    return full.slice(0, idx);
  }
  return full.replace(reading, "");
}

function resolveCaptionHost(root) {
  if (!(root instanceof Element)) return null;
  if (root instanceof HTMLElement) {
    return (
      root.closest?.(
        ".yt-furigana-yt-overlay, .ytp-caption-segment, .caption-visual-line, .vjs-text-track-cue-line > span, [data-yt-furigana-styled]"
      ) || root
    );
  }
  return null;
}

/**
 * 隣接する読みが実測で重なっているときだけ、境界のパディングで最小限押し離す。
 * 各読みの全幅ぶん事前確保はしない（くれない前後の大空白を防ぐ）。
 *
 * 重要: 折り返し後の「次の行の先頭」と前行末は DOM 上は隣接でも座標は別行。
 * それを重なりと誤ると need が数百 px になりレイアウトが崩壊するので、
 * 同一行のみ・押し広げは上限付き。
 */
export function separateOverlappingRubyReadings(
  root,
  {
    minGapPx = RUBY_READING_GAP_MIN_PX,
    maxPasses = RUBY_SEPARATE_MAX_PASSES,
    maxPushPx = 6
  } = {}
) {
  if (!root || typeof root.querySelectorAll !== "function") return 0;
  const pushCap = Math.max(1, Number(maxPushPx) || 6);
  let adjustments = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const rubies = Array.from(root.querySelectorAll("ruby")).filter((ruby) =>
      ruby.querySelector(":scope > rt, rt")
    );
    let moved = false;

    for (let i = 0; i < rubies.length - 1; i += 1) {
      const leftRuby = rubies[i];
      const rightRuby = rubies[i + 1];
      if (!(leftRuby instanceof HTMLElement) || !(rightRuby instanceof HTMLElement)) {
        continue;
      }
      const leftRt =
        leftRuby.querySelector(":scope > rt") || leftRuby.querySelector("rt");
      const rightRt =
        rightRuby.querySelector(":scope > rt") || rightRuby.querySelector("rt");
      if (!(leftRt instanceof HTMLElement) || !(rightRt instanceof HTMLElement)) {
        continue;
      }

      leftRt.style.letterSpacing = "0";
      rightRt.style.letterSpacing = "0";

      const leftRect = leftRt.getBoundingClientRect();
      const rightRect = rightRt.getBoundingClientRect();
      if (!(leftRect.width > 0) || !(rightRect.width > 0)) continue;

      // 別行（折り返し）は触らない
      const lineSlack = Math.max(leftRect.height, rightRect.height, 8) * 0.75;
      if (Math.abs(leftRect.top - rightRect.top) > lineSlack) continue;

      const gap = rightRect.left - leftRect.right;
      const rtFont = Number.parseFloat(getComputedStyle(leftRt).fontSize) || 10;
      const fontGap = Math.max(minGapPx, rtFont * 0.06);
      if (gap >= fontGap) continue;

      const need = Math.min(pushCap, (fontGap - gap) / 2 + 0.25);
      if (!(need > 0.1)) continue;

      const leftPad = Number.parseFloat(leftRuby.style.paddingRight) || 0;
      const rightPad = Number.parseFloat(rightRuby.style.paddingLeft) || 0;
      // minWidth は付けない（長文で幅が雪だるま式に増える）
      leftRuby.style.paddingRight = `${leftPad + need}px`;
      rightRuby.style.paddingLeft = `${rightPad + need}px`;

      adjustments += 1;
      moved = true;
    }

    if (!moved) break;
  }

  return adjustments;
}

/**
 * 同一行判定付きの押し広げ量（テスト用）。
 * @param {{ leftTop: number, rightTop: number, leftHeight: number, rightHeight: number, gapPx: number, minGapPx?: number, maxPushPx?: number }} input
 */
export function computeRubySeparatePushPx({
  leftTop,
  rightTop,
  leftHeight,
  rightHeight,
  gapPx,
  minGapPx = RUBY_READING_GAP_MIN_PX,
  maxPushPx = 6
}) {
  const lineSlack = Math.max(leftHeight, rightHeight, 8) * 0.75;
  if (Math.abs(leftTop - rightTop) > lineSlack) return 0;
  if (gapPx >= minGapPx) return 0;
  return Math.min(Math.max(1, maxPushPx), (minGapPx - gapPx) / 2 + 0.25);
}

function resolveAvailableWidth(host) {
  const stored = Number.parseFloat(host.getAttribute("data-yt-furigana-line-width") || "");
  if (stored > 0) return stored;

  const win = host.closest?.(
    ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window"
  );
  const winW = win instanceof HTMLElement ? win.clientWidth : 0;
  if (winW > 0) return Math.max(0, winW - 12);

  const parentW =
    host.parentElement instanceof HTMLElement ? host.parentElement.clientWidth : 0;
  if (parentW > 0) return parentW;

  return host.clientWidth || 0;
}

/**
 * 単一行ロック時の利用可能幅。窓幅を優先（本文幅＝内容幅だと縮小判定できない）。
 * @param {HTMLElement} host
 */
function resolveKeepOneLineAvailableWidth(host) {
  const win = host.closest?.(
    ".caption-window, .captions-text, .vjs-text-track-cue, .vjs-text-track-window, .html5-video-player"
  );
  let winW = 0;
  if (win instanceof HTMLElement) {
    winW = win.clientWidth || win.getBoundingClientRect().width || 0;
  }
  const player = host.closest?.(".html5-video-player, .video-js");
  const playerW =
    player instanceof HTMLElement
      ? player.clientWidth || player.getBoundingClientRect().width || 0
      : 0;
  const stored = Number.parseFloat(host.getAttribute("data-yt-furigana-line-width") || "");
  // プレイヤーの約 90% まで使ってよい（中央字幕の一般的上限）
  const softCap = playerW > 0 ? playerW * 0.92 : winW > 0 ? winW : stored;
  const candidates = [stored, winW > 12 ? winW - 12 : 0, softCap].filter((n) => n > 0);
  if (candidates.length === 0) return host.scrollWidth || host.clientWidth || 0;
  return Math.max(...candidates);
}

function measureOneLineContentWidth(host) {
  const lock = host.querySelector?.(`:scope > .${ONE_LINE_CLASS}, .${ONE_LINE_CLASS}`);
  if (lock instanceof HTMLElement) {
    return Math.ceil(lock.scrollWidth || lock.getBoundingClientRect().width || 0);
  }
  return Math.ceil(host.scrollWidth || host.getBoundingClientRect().width || 0);
}

function ensureOneLineWrapper(host) {
  if (!(host instanceof HTMLElement)) return null;
  const existing = host.querySelector(`:scope > .${ONE_LINE_CLASS}`);
  if (existing instanceof HTMLElement) return existing;
  if (!host.childNodes.length) return null;
  const wrap = document.createElement("span");
  wrap.className = ONE_LINE_CLASS;
  while (host.firstChild) wrap.appendChild(host.firstChild);
  host.appendChild(wrap);
  return wrap;
}

function widenCaptionWindowForOneLine(host, neededWidthPx) {
  const needed = Math.ceil(Number(neededWidthPx) || 0);
  if (!(needed > 0)) return;
  host.setAttribute("data-yt-furigana-needed-width", String(needed));

  const win = host.closest?.(".caption-window, .captions-text");
  if (!(win instanceof HTMLElement)) return;

  const player = host.closest?.(".html5-video-player");
  const maxW =
    player instanceof HTMLElement
      ? Math.floor((player.clientWidth || player.getBoundingClientRect().width || needed) * 0.94)
      : needed;
  const width = Math.min(needed + 8, maxW > 0 ? maxW : needed + 8);
  win.style.setProperty("width", `${width}px`, "important");
  win.style.setProperty("max-width", "94%", "important");
  win.style.setProperty("overflow", "visible", "important");
}

/**
 * 元が1行の字幕を nowrap + 縮小（必要なら窓広げ）で1行に固定する。
 * @param {HTMLElement} host
 * @param {ParentNode} root
 */
function enforceKeepOneLine(host, root) {
  host.style.setProperty("white-space", "nowrap", "important");
  host.style.setProperty("word-break", "keep-all", "important");
  host.style.setProperty("line-break", "strict", "important");
  host.style.setProperty("overflow-wrap", "normal", "important");

  ensureOneLineWrapper(host);

  const lockedAttr = host.getAttribute("data-yt-furigana-font-size");
  const baseFontPx =
    Number.parseFloat(lockedAttr) ||
    Number.parseFloat(getComputedStyle(host).fontSize) ||
    16;
  // 計測前に基準サイズへ戻す（前回縮小の累積防止）
  host.style.setProperty("font-size", `${baseFontPx}px`, "important");

  // 押し広げは控えめ（幅を食いすぎて縮小が激しくなるのを防ぐ）
  separateOverlappingRubyReadings(root, { maxPushPx: 3 });
  if (host !== root) separateOverlappingRubyReadings(host, { maxPushPx: 3 });

  const available = resolveKeepOneLineAvailableWidth(host);
  const contentWidth = measureOneLineContentWidth(host);
  const plan = planKeepOneLineFit({
    contentWidth,
    availableWidth: available,
    baseFontPx
  });

  if (plan.scale < 1) {
    host.style.setProperty("font-size", `${plan.fontSizePx}px`, "important");
  }

  if (plan.needsWiden) {
    widenCaptionWindowForOneLine(host, contentWidth * plan.scale);
  } else if (contentWidth > available + 1 && plan.scale >= MIN_KEEP_ONE_LINE_SCALE) {
    // 縮小後もギリギリなら窓を内容幅に寄せる
    const after = measureOneLineContentWidth(host);
    if (after > available + 1) widenCaptionWindowForOneLine(host, after);
  }
}

function isInsideTVerCaption(node) {
  return Boolean(
    node &&
      typeof node.closest === "function" &&
      node.closest(".vjs-text-track-display")
  );
}

function applyRubyFitPass(root) {
  for (const ruby of root.querySelectorAll("ruby")) {
    const rt = ruby.querySelector(":scope > rt") || ruby.querySelector("rt");
    if (!(ruby instanceof HTMLElement) || !(rt instanceof HTMLElement)) continue;

    // 本文ラッパは任意（あっても害はない）
    ensureRubyBaseWrapper(ruby, rt);

    // flex 縦積みは読み幅で ruby が広がり「1行が2行」になるので使わない。
    // absolute なら幅は本文基準のまま、読みは上に重ねる。
    ruby.style.setProperty("display", "inline-block", "important");
    ruby.style.setProperty("flex-direction", "unset", "important");
    ruby.style.setProperty("align-items", "unset", "important");
    ruby.style.setProperty("justify-content", "unset", "important");
    ruby.style.setProperty("vertical-align", "baseline", "important");
    ruby.style.setProperty("position", "relative", "important");
    ruby.style.setProperty("line-height", "1", "important");
    ruby.style.setProperty("overflow", "visible", "important");
    ruby.style.setProperty("ruby-position", "unset", "important");
    ruby.style.removeProperty("min-width");
    ruby.style.removeProperty("letter-spacing");

    rt.style.setProperty("position", "absolute", "important");
    rt.style.setProperty("display", "block", "important");
    rt.style.setProperty("order", "unset", "important");
    rt.style.setProperty("left", "50%", "important");
    rt.style.setProperty("right", "auto", "important");
    rt.style.setProperty("font-size", "0.5em", "important");
    rt.style.setProperty("line-height", "1", "important");
    rt.style.setProperty("font-weight", "400", "important");
    rt.style.setProperty("letter-spacing", "0", "important");
    rt.style.setProperty("white-space", "nowrap", "important");
    rt.style.setProperty("width", "max-content", "important");
    rt.style.setProperty("max-width", "none", "important");
    rt.style.setProperty("text-align", "center", "important");
    rt.style.setProperty("margin", "0", "important");
    rt.style.setProperty("transform", "translateX(-50%)", "important");

    // TVer: 本文位置を動かさず、読みだけ上へ浮かせる（padding-top 禁止）
    if (isInsideTVerCaption(ruby)) {
      ruby.style.setProperty("padding-top", "0", "important");
      rt.style.setProperty("top", "auto", "important");
      rt.style.setProperty("bottom", "calc(100% + 0.08em)", "important");
      rt.style.setProperty("transform-origin", "center bottom", "important");
      continue;
    }

    // YouTube 等: padding-top でルビ領域を確保し、rt をその中に置く
    ruby.style.setProperty("padding-top", "0.68em", "important");
    rt.style.setProperty("top", "0", "important");
    rt.style.setProperty("bottom", "auto", "important");
    rt.style.setProperty("transform-origin", "center top", "important");

    const baseFontSizePx =
      Number.parseFloat(getComputedStyle(ruby).fontSize) || 16;
    const rtFontSizePx = Number.parseFloat(getComputedStyle(rt).fontSize) || 12;
    const rtHeight = rt.getBoundingClientRect().height || rtFontSizePx;
    const padPx = computeRubyPadTopPx({
      rtHeightPx: rtHeight,
      rtFontSizePx,
      baseFontSizePx
    });
    ruby.style.setProperty("padding-top", `${padPx}px`, "important");
  }
}

/**
 * 余白付きルビを適用する。
 * 注入前に単一行だった字幕は折り返さず、縮小／窓幅で1行を維持する。
 * @param {ParentNode|Element|null|undefined} root
 * @param {{ allowFontShrink?: boolean }} [options] 互換用（単一行時は常に縮小可）
 */
export function fitRubyReadings(root, _options = {}) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  const host = resolveCaptionHost(root);
  const keepOneLine = isKeepOneLineCaption(host);

  if (host instanceof HTMLElement && !keepOneLine) {
    // 元から複数行のキューだけ折り返し許可
    host.style.setProperty("white-space", "normal");
    host.style.setProperty("word-break", "keep-all");
    host.style.setProperty("line-break", "strict");
    host.style.setProperty("overflow-wrap", "normal");
    const locked = host.getAttribute("data-yt-furigana-font-size");
    if (locked) {
      host.style.setProperty("font-size", locked, "important");
    }
  }

  applyRubyFitPass(root);

  if (host instanceof HTMLElement && keepOneLine) {
    enforceKeepOneLine(host, root);
    return;
  }

  separateOverlappingRubyReadings(root);
  if (host instanceof HTMLElement) {
    separateOverlappingRubyReadings(host);
  }
}
