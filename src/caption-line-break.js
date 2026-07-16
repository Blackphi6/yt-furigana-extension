/**
 * 字幕の自然な折り返し用。BudouX で句境界を求め、ふりがな HTML の
 * タグ外（特に <ruby> / .yt-furigana-word の外）にだけ ZWSP を入れる。
 *
 * 句境界は「全部」ではなく、字幕枠幅から見積もった 1 行文字数目安付近だけ。
 * （全部入れると短い句の直後で早割れして不自然に見える）
 *
 * トークン化・ルビ生成「前」には掛けない（原文一致・形態素を壊さない）。
 */

import { loadDefaultJapaneseParser } from "budoux";

const ZWSP = "\u200B";

/** YouTube 字幕の目安。短い文の早割れを避けるため下限は約30字 */
export const DEFAULT_MAX_LINE_CHARS = 30;

let parser = null;

function getParser() {
  if (!parser) parser = loadDefaultJapaneseParser();
  return parser;
}

/**
 * 字幕枠幅とフォントから 1 行あたりの目安文字数を見積もる。
 * 狭い見積もりでも 30 字未満にはしない（短文の不要改行防止）。
 * @param {{ lineWidthPx?: number, fontSizePx?: number }} [input]
 */
export function estimateMaxLineChars({ lineWidthPx = 0, fontSizePx = 0 } = {}) {
  const w = Number(lineWidthPx) || 0;
  const fs = Number(fontSizePx) || 0;
  if (w > 0 && fs > 0) {
    // 全角相当 ≈ fontSize。ルビ余白ぶんやや窄めに見積もる
    const chars = Math.floor((w * 0.9) / fs);
    return Math.max(DEFAULT_MAX_LINE_CHARS, Math.min(42, chars));
  }
  return DEFAULT_MAX_LINE_CHARS;
}

/**
 * 字幕 DOM から目安文字数を取る（captureCaptionStyles 後を想定）。
 * @param {Element | null | undefined} element
 */
export function maxLineCharsFromElement(element) {
  if (!(element instanceof HTMLElement)) return DEFAULT_MAX_LINE_CHARS;

  const storedW = Number.parseFloat(
    element.getAttribute("data-yt-furigana-line-width") || ""
  );
  const width =
    (storedW > 0 ? storedW : 0) ||
    element.clientWidth ||
    element.parentElement?.clientWidth ||
    0;

  const storedFs = Number.parseFloat(
    element.getAttribute("data-yt-furigana-font-size") || ""
  );
  let fontSize = storedFs > 0 ? storedFs : 0;
  if (!(fontSize > 0) && typeof getComputedStyle === "function") {
    fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 0;
  }

  return estimateMaxLineChars({ lineWidthPx: width, fontSizePx: fontSize });
}

/**
 * BudouX 句を「1行目安」に詰めて、行末付近の句境界だけ返す。
 * @param {string[]} phrases
 * @param {number} maxLineChars
 * @returns {number[]} 可視文字オフセット（その位置の直前で改行可）
 */
export function selectSoftBreakOffsets(phrases, maxLineChars = DEFAULT_MAX_LINE_CHARS) {
  if (!Array.isArray(phrases) || phrases.length <= 1) return [];

  const max = Math.max(4, Math.floor(Number(maxLineChars) || DEFAULT_MAX_LINE_CHARS));
  /** @type {number[]} */
  const offsets = [];
  let lineStart = 0;
  let offset = 0;

  for (let i = 0; i < phrases.length; i += 1) {
    const len = phrases[i].length;
    if (!(len > 0)) continue;
    const lineLen = offset - lineStart;
    if (i > 0 && lineLen > 0 && lineLen + len > max) {
      offsets.push(offset);
      lineStart = offset;
    }
    offset += len;
  }

  return offsets.filter((pos, index, arr) => pos > 0 && arr.indexOf(pos) === index);
}

/**
 * <rt> 内を除いた可視本文と、各文字の HTML オフセット対応表。
 * @param {string} html
 * @returns {{ visible: string, map: number[] }}
 */
export function extractVisibleTextMap(html) {
  const source = String(html || "");
  let visible = "";
  /** @type {number[]} */
  const map = [];
  let i = 0;
  let inRt = 0;

  while (i < source.length) {
    if (source[i] === "<") {
      const end = source.indexOf(">", i);
      if (end < 0) break;
      const tag = source.slice(i, end + 1);
      if (/^<rt(?:\s|>)/i.test(tag)) inRt += 1;
      else if (/^<\/rt\s*>/i.test(tag)) inRt = Math.max(0, inRt - 1);
      i = end + 1;
      continue;
    }
    if (inRt === 0) {
      map.push(i);
      visible += source[i];
    }
    i += 1;
  }

  return { visible, map };
}

/**
 * htmlIdx が <ruby> や .yt-furigana-word 内なら、その開始タグ直前へ退避。
 * @param {string} html
 * @param {number} htmlIdx
 */
export function moveBreakBeforeAtomicUnit(html, htmlIdx) {
  if (!(htmlIdx > 0) || htmlIdx > html.length) return htmlIdx;

  const before = html.slice(0, htmlIdx);
  const rubyOpen = before.lastIndexOf("<ruby");
  const rubyClose = before.lastIndexOf("</ruby>");
  const insideRuby = rubyOpen > rubyClose;

  if (!insideRuby) return htmlIdx;

  const spanOpen = before.lastIndexOf("<span");
  const spanClose = before.lastIndexOf("</span>");
  if (spanOpen > spanClose && spanOpen >= 0) {
    const head = html.slice(spanOpen, Math.min(html.length, spanOpen + 120));
    if (head.includes("yt-furigana-word")) {
      return spanOpen;
    }
  }

  return rubyOpen >= 0 ? rubyOpen : htmlIdx;
}

/**
 * ふりがな済み HTML に BudouX 句境界のソフトブレーク（ZWSP）を挿入する。
 * 失敗時は原文 HTML をそのまま返す（YouTube 側挙動にフォールバック）。
 * @param {string} html
 * @param {{ maxLineChars?: number }} [options]
 * @returns {string}
 */
export function insertCaptionSoftBreaks(html, options = {}) {
  const source = String(html || "");
  if (!source || source.includes(ZWSP)) return source;

  const maxLineChars =
    Number(options.maxLineChars) > 0
      ? Number(options.maxLineChars)
      : DEFAULT_MAX_LINE_CHARS;

  try {
    const { visible, map } = extractVisibleTextMap(source);
    if (!visible || map.length === 0) return source;
    // 1行に収まるなら改行候補を入れない
    if (visible.length <= maxLineChars) return source;

    const phrases = getParser().parse(visible);
    if (!Array.isArray(phrases) || phrases.length <= 1) return source;
    if (phrases.join("") !== visible) return source;

    const breaks = selectSoftBreakOffsets(phrases, maxLineChars).filter(
      (offset) => offset > 0 && offset < visible.length
    );
    if (breaks.length === 0) return source;

    let out = source;
    for (let i = breaks.length - 1; i >= 0; i -= 1) {
      const vIdx = breaks[i];
      let htmlIdx = map[vIdx];
      if (htmlIdx == null) continue;
      htmlIdx = moveBreakBeforeAtomicUnit(out, htmlIdx);
      if (!(htmlIdx > 0) || htmlIdx > out.length) continue;
      if (out[htmlIdx - 1] === ZWSP) continue;
      const lt = out.lastIndexOf("<", htmlIdx - 1);
      const gt = out.lastIndexOf(">", htmlIdx - 1);
      if (lt > gt) continue;
      out = `${out.slice(0, htmlIdx)}${ZWSP}${out.slice(htmlIdx)}`;
    }
    return out;
  } catch {
    return source;
  }
}

export { ZWSP };
