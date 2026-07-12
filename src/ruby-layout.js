/** 読みの字間を詰める下限（em）。これ以下は潰れて読めなくなる */
export const MAX_RT_TIGHTEN_EM = -0.1;

/**
 * @param {{
 *   rubyWidth: number,
 *   rtNaturalWidth: number,
 *   rtLength: number,
 *   baseLength: number,
 *   rtFontSizePx: number
 * }} input
 */
export function computeRubyFit({
  rubyWidth,
  rtNaturalWidth,
  rtLength,
  baseLength,
  rtFontSizePx
}) {
  if (!(rubyWidth > 0) || !(rtNaturalWidth > 0)) {
    return {
      rtLetterSpacingPx: 0,
      baseLetterSpacingPx: 0,
      paddingInlinePx: 0,
      minWidthPx: null
    };
  }

  if (rtNaturalWidth <= rubyWidth + 1) {
    return {
      rtLetterSpacingPx: 0,
      baseLetterSpacingPx: 0,
      paddingInlinePx: 0,
      minWidthPx: null
    };
  }

  const maxTightenPx = MAX_RT_TIGHTEN_EM * (rtFontSizePx || 1);
  let rtLetterSpacingPx = 0;
  if (rtLength >= 2) {
    rtLetterSpacingPx = (rubyWidth - rtNaturalWidth) / (rtLength - 1);
    rtLetterSpacingPx = Math.max(rtLetterSpacingPx, maxTightenPx);
  }

  const rtWidthAfter =
    rtNaturalWidth + Math.max(0, rtLength - 1) * rtLetterSpacingPx;

  let baseLetterSpacingPx = 0;
  let paddingInlinePx = 0;
  let minWidthPx = null;

  if (rtWidthAfter > rubyWidth + 1) {
    const extra = rtWidthAfter - rubyWidth;
    minWidthPx = Math.ceil(rtWidthAfter - 1e-9);
    if (baseLength >= 2) {
      baseLetterSpacingPx = extra / (baseLength - 1);
    } else {
      paddingInlinePx = extra / 2;
    }
  }

  return {
    rtLetterSpacingPx,
    baseLetterSpacingPx,
    paddingInlinePx,
    minWidthPx
  };
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

/**
 * 長い読み: 字間詰め → 足りなければ漢字側を広げる（字形の横圧縮はしない）
 * 縦方向: rt を ruby の padding-top 内に置き、行ボックスの外に出さない
 * @param {ParentNode|Element|null|undefined} root
 */
export function fitRubyReadings(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;

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

    // いったん仮の padding で測る
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
    if (fit.baseLetterSpacingPx) {
      ruby.style.letterSpacing = `${fit.baseLetterSpacingPx}px`;
    }
    if (fit.paddingInlinePx) {
      ruby.style.paddingLeft = `${fit.paddingInlinePx}px`;
      ruby.style.paddingRight = `${fit.paddingInlinePx}px`;
    }
    if (fit.minWidthPx) {
      ruby.style.minWidth = `${fit.minWidthPx}px`;
    }

    if (fit.baseLetterSpacingPx && !fit.rtLetterSpacingPx) {
      rt.style.letterSpacing = "0px";
    } else if (fit.baseLetterSpacingPx && fit.rtLetterSpacingPx) {
      rt.style.letterSpacing = `${fit.rtLetterSpacingPx}px`;
    }

    // 実測したルビ高さ分だけ padding-top を確保（行の外に出さない）
    const rtHeight = rt.getBoundingClientRect().height;
    const padPx = Math.max(
      Math.ceil(rtHeight + 2),
      Math.ceil(rtFontSizePx * 1.15)
    );
    ruby.style.setProperty("padding-top", `${padPx}px`);
    rt.style.setProperty("transform", "translateX(-50%)");
  }
}
