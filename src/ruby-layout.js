/** 読みの字間を詰める下限（em）。軽い詰めのみ（横スケールはしない） */
export const MAX_RT_TIGHTEN_EM = -0.08;

/** 1行に収まらない一塊のためのフォント縮小下限 */
export const MIN_CAPTION_SCALE = 0.72;

/**
 * @param {{
 *   rubyWidth: number,
 *   rtNaturalWidth: number,
 *   rtLength: number,
 *   baseLength: number,
 *   rtFontSizePx: number
 * }} input
 *
 * 方針:
 * - ふりがなの横スケール圧縮・フォント縮小はしない
 * - 読みが本文より長いときは左右に均等な余白（隣接ルビ衝突防止）
 * - 漢字の字間は引き延ばさない
 */
export function computeRubyFit({
  rubyWidth,
  rtNaturalWidth,
  rtLength,
  baseLength,
  rtFontSizePx
}) {
  const empty = {
    rtLetterSpacingPx: 0,
    baseLetterSpacingPx: 0,
    paddingInlinePx: 0,
    minWidthPx: null,
    rtScaleX: 1
  };

  if (!(rubyWidth > 0) || !(rtNaturalWidth > 0)) {
    return empty;
  }

  if (rtNaturalWidth <= rubyWidth + 1) {
    return empty;
  }

  const maxTightenPx = MAX_RT_TIGHTEN_EM * (rtFontSizePx || 1);
  let rtLetterSpacingPx = 0;
  if (rtLength >= 2) {
    rtLetterSpacingPx = (rubyWidth - rtNaturalWidth) / (rtLength - 1);
    rtLetterSpacingPx = Math.max(rtLetterSpacingPx, maxTightenPx);
  }

  const rtWidthAfter =
    rtNaturalWidth + Math.max(0, rtLength - 1) * rtLetterSpacingPx;

  if (rtWidthAfter <= rubyWidth + 1) {
    return {
      ...empty,
      rtLetterSpacingPx
    };
  }

  const extra = rtWidthAfter - rubyWidth;
  return {
    rtLetterSpacingPx,
    baseLetterSpacingPx: 0,
    paddingInlinePx: extra / 2,
    minWidthPx: Math.ceil(rtWidthAfter - 1e-9),
    rtScaleX: 1
  };
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
        ".ytp-caption-segment, .caption-visual-line, .vjs-text-track-cue-line > span, [data-yt-furigana-styled]"
      ) || root
    );
  }
  return null;
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

function applyRubyFitPass(root) {
  for (const ruby of root.querySelectorAll("ruby")) {
    const rt = ruby.querySelector(":scope > rt") || ruby.querySelector("rt");
    if (!rt) continue;

    ruby.style.removeProperty("min-width");
    ruby.style.removeProperty("letter-spacing");
    ruby.style.removeProperty("padding-left");
    ruby.style.removeProperty("padding-right");
    ruby.style.removeProperty("padding-top");
    rt.style.removeProperty("letter-spacing");
    rt.style.removeProperty("transform");
    rt.style.removeProperty("font-size");
    rt.style.removeProperty("top");
    rt.style.removeProperty("bottom");

    ruby.style.setProperty("display", "inline-block");
    ruby.style.setProperty("vertical-align", "baseline");
    ruby.style.setProperty("position", "relative");
    ruby.style.setProperty("line-height", "1");

    ruby.style.setProperty("padding-top", "0.72em");
    rt.style.setProperty("top", "0.02em");
    rt.style.setProperty("left", "50%");
    rt.style.setProperty("transform", "translateX(-50%)");
    rt.style.setProperty("transform-origin", "center top");

    const rubyWidth = ruby.getBoundingClientRect().width;
    const rtNaturalWidth = rt.scrollWidth || rt.getBoundingClientRect().width;
    const rtFontSizePx = Number.parseFloat(getComputedStyle(rt).fontSize) || 12;
    const reading = rt.textContent || "";
    const base = rubyBaseText(ruby, rt);
    const rtLength = Array.from(reading).length;
    const baseLength = Array.from(base).length;

    const fit = computeRubyFit({
      rubyWidth,
      rtNaturalWidth,
      rtLength,
      baseLength,
      rtFontSizePx
    });

    if (fit.rtLetterSpacingPx) {
      rt.style.letterSpacing = `${fit.rtLetterSpacingPx}px`;
    }
    if (fit.paddingInlinePx) {
      ruby.style.paddingLeft = `${fit.paddingInlinePx}px`;
      ruby.style.paddingRight = `${fit.paddingInlinePx}px`;
    }
    if (fit.minWidthPx) {
      ruby.style.minWidth = `${fit.minWidthPx}px`;
    }

    rt.style.setProperty("transform", "translateX(-50%)");

    const rtHeight = rt.getBoundingClientRect().height;
    const padPx = Math.max(
      Math.ceil(rtHeight + 2),
      Math.ceil(rtFontSizePx * 1.15)
    );
    ruby.style.setProperty("padding-top", `${padPx}px`);
  }
}

/**
 * 余白付きルビを適用したあと、BudouX のソフトブレークで自然に折り返す。
 * 切れない一塊（長いルビなど）だけ枠幅に合わせてフォント縮小する。
 * ふりがな字形の横圧縮はしない。
 * @param {ParentNode|Element|null|undefined} root
 */
export function fitRubyReadings(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;

  const host = resolveCaptionHost(root);
  if (host instanceof HTMLElement) {
    // ZWSP / <wbr> 位置だけで折り返す。文字途中割れは抑止。
    host.style.setProperty("white-space", "normal");
    host.style.setProperty("word-break", "keep-all");
    host.style.setProperty("line-break", "strict");
    host.style.setProperty("overflow-wrap", "normal");
  }

  applyRubyFitPass(root);

  if (!(host instanceof HTMLElement)) return;

  const available = resolveAvailableWidth(host);
  if (!(available > 0)) return;

  const contentWidth = host.scrollWidth;
  const scale = computeLineShrinkScale(contentWidth, available);
  if (scale >= 0.999) return;

  const currentPx = Number.parseFloat(getComputedStyle(host).fontSize) || 16;
  const nextPx = currentPx * scale;
  host.style.setProperty("font-size", `${nextPx}px`, "important");
  host.setAttribute("data-yt-furigana-font-size", `${nextPx}px`);

  applyRubyFitPass(host);

  const again = computeLineShrinkScale(host.scrollWidth, available);
  if (again < 0.999) {
    const px = Number.parseFloat(getComputedStyle(host).fontSize) || nextPx;
    host.style.setProperty("font-size", `${px * again}px`, "important");
    host.setAttribute("data-yt-furigana-font-size", `${px * again}px`);
    applyRubyFitPass(host);
  }
}
