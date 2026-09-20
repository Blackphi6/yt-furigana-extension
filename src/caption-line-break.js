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
 * 日本語を BudouX 句に分ける。失敗時は原文1本。
 * @param {string} text
 * @returns {string[]}
 */
export function parseJapanesePhrases(text) {
  const raw = String(text || "");
  if (!raw) return [];
  try {
    const phrases = getParser().parse(raw);
    if (Array.isArray(phrases) && phrases.join("") === raw) {
      return phrases.filter((p) => p.length > 0);
    }
  } catch {
    /* fall through */
  }
  return [raw];
}

/**
 * すべての句境界オフセット（先頭以外）。
 * @param {string[]} phrases
 * @returns {number[]}
 */
export function phraseBoundaryOffsets(phrases) {
  if (!Array.isArray(phrases) || phrases.length <= 1) return [];
  /** @type {number[]} */
  const offsets = [];
  let offset = 0;
  for (const phrase of phrases) {
    const len = phrase.length;
    if (!(len > 0)) continue;
    if (offset > 0) offsets.push(offset);
    offset += len;
  }
  return offsets;
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
 * htmlIdx が .yt-furigana-word / <ruby> 内なら、その開始タグ直前へ退避。
 * （かなだけの word span も ruby 無しで囲むので、span を先に見る）
 * @param {string} html
 * @param {number} htmlIdx
 */
export function moveBreakBeforeAtomicUnit(html, htmlIdx) {
  if (!(htmlIdx > 0) || htmlIdx > html.length) return htmlIdx;

  const before = html.slice(0, htmlIdx);
  const spanOpen = before.lastIndexOf("<span");
  const spanClose = before.lastIndexOf("</span>");
  if (spanOpen > spanClose && spanOpen >= 0) {
    const head = html.slice(spanOpen, Math.min(html.length, spanOpen + 160));
    if (/\byt-furigana-word\b/.test(head)) {
      return spanOpen;
    }
  }

  const rubyOpen = before.lastIndexOf("<ruby");
  const rubyClose = before.lastIndexOf("</ruby>");
  if (rubyOpen > rubyClose && rubyOpen >= 0) {
    return rubyOpen;
  }

  return htmlIdx;
}

/**
 * 可視文字位置を含む .yt-furigana-word / <ruby> の閉じタグ直後へ進める。
 * slice の終端が「次の語の先頭文字」の map を指すとタグ途中切れになるので、
 * 含める最後の文字基準で閉じる。
 * @param {string} html
 * @param {number} charHtmlIdx map[lastIncluded]（その文字の HTML オフセット）
 */
export function moveEndAfterAtomicUnit(html, charHtmlIdx) {
  if (!(charHtmlIdx >= 0) || charHtmlIdx >= html.length) {
    return Math.max(0, html.length);
  }

  const unitStart = moveBreakBeforeAtomicUnit(html, charHtmlIdx);
  if (unitStart >= charHtmlIdx) {
    // タグ外の生文字
    return charHtmlIdx + 1;
  }

  const open = html.slice(unitStart).match(/^<(span|ruby)\b[^>]*>/i);
  if (!open) return charHtmlIdx + 1;
  const tagName = open[1].toLowerCase();
  let depth = 0;
  let i = unitStart;
  while (i < html.length) {
    if (html[i] !== "<") {
      i += 1;
      continue;
    }
    const gt = html.indexOf(">", i);
    if (gt < 0) break;
    const tag = html.slice(i, gt + 1);
    if (new RegExp(`^<${tagName}\\b`, "i").test(tag)) depth += 1;
    else if (new RegExp(`^</${tagName}\\s*>`, "i").test(tag)) {
      depth -= 1;
      if (depth === 0) return gt + 1;
    }
    i = gt + 1;
  }
  return html.length;
}

/**
 * ふりがな済み HTML に BudouX 句境界のソフトブレーク（ZWSP）を挿入する。
 * 失敗時は原文 HTML をそのまま返す（YouTube 側挙動にフォールバック）。
 * @param {string} html
 * @param {{ maxLineChars?: number, allPhrases?: boolean }} [options]
 * @returns {string}
 */
export function insertCaptionSoftBreaks(html, options = {}) {
  const source = String(html || "");
  if (!source || source.includes(ZWSP)) return source;

  const allPhrases = options.allPhrases === true;
  const maxLineChars =
    Number(options.maxLineChars) > 0
      ? Number(options.maxLineChars)
      : DEFAULT_MAX_LINE_CHARS;

  try {
    const { visible, map } = extractVisibleTextMap(source);
    if (!visible || map.length === 0) return source;
    // 字幕: 1行に収まるなら改行候補を入れない。SC プレビューは全句境界。
    if (!allPhrases && visible.length <= maxLineChars) return source;

    const phrases = parseJapanesePhrases(visible);
    if (phrases.length <= 1) return source;
    if (phrases.join("") !== visible) return source;

    const breaks = (
      allPhrases
        ? phraseBoundaryOffsets(phrases)
        : selectSoftBreakOffsets(phrases, maxLineChars)
    ).filter((offset) => offset > 0 && offset < visible.length);
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

/**
 * 全文ふりがな HTML から、表層 slice に対応する部分だけ切り出す。
 * TVer の色 span ごとに適用しつつ、行全体で API した HTML を分ける用。
 *
 * 終端は map[end]（次の文字）ではなく「含める最後の文字」の閉じタグまで。
 * 末尾スペース付き slice（「袖で 」→ 次が「小」）で次語の <ruby> だけ巻き込む事故を防ぐ。
 */
export function sliceFuriganaHtmlByPlainText(html, fullText, sliceText) {
  const source = String(html || "");
  const full = String(fullText || "");
  const slice = String(sliceText || "");
  if (!source || !slice) return source;
  if (slice === full) return source;
  const start = full.indexOf(slice);
  if (start < 0) return "";
  const end = start + slice.length;
  const last = end - 1;
  const { map } = extractVisibleTextMap(source);
  if (!map.length || start >= map.length || last < start || last >= map.length) {
    return "";
  }
  let htmlStart = moveBreakBeforeAtomicUnit(source, map[start]);
  const htmlEnd = moveEndAfterAtomicUnit(source, map[last]);
  if (!(htmlStart >= 0) || !(htmlEnd > htmlStart)) return "";
  return source.slice(htmlStart, htmlEnd);
}
