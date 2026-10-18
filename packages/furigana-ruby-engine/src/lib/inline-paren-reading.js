/**
 * 字幕でよくある「音（ね）」「今日（きょう）」形式のカッコ書き読みを取り込む。
 * 表示からは（ね）を取り除き、直前の漢字列の読みとして採用する。
 */

import { normalizeUserReading } from "./reading-normalize.js";

/** 漢字列 + （かな） / (かな) */
const INLINE_PAREN_RE =
  /([\u3400-\u9fff\uF900-\uFAFF々〻]+)[（(]([ぁ-んァ-ヶー]+)[）)]/g;

/**
 * @param {string} text
 * @returns {{
 *   text: string,
 *   spans: Array<{ start: number, end: number, surface: string, reading: string }>
 * }}
 */
export function extractInlineParenReadings(text) {
  const source = String(text ?? "");
  if (!source) return { text: "", spans: [] };

  /** @type {Array<{ start: number, end: number, surface: string, reading: string }>} */
  const spans = [];
  let cleaned = "";
  let last = 0;

  for (const match of source.matchAll(INLINE_PAREN_RE)) {
    const full = match[0];
    const surface = match[1];
    const rawReading = match[2];
    const reading = normalizeUserReading(rawReading);
    const index = match.index ?? 0;

    cleaned += source.slice(last, index);

    if (surface && reading) {
      const start = cleaned.length;
      cleaned += surface;
      spans.push({
        start,
        end: cleaned.length,
        surface,
        reading
      });
    } else {
      cleaned += full;
    }

    last = index + full.length;
  }

  cleaned += source.slice(last);
  return { text: cleaned, spans };
}

/**
 * @param {Array<{ surface_form?: string }>} tokens
 * @returns {Array<{ surface_form: string, start: number, end: number, [key: string]: unknown }>}
 */
function withCharSpans(tokens) {
  let offset = 0;
  return (tokens || []).map((token) => {
    const surface = String(token?.surface_form ?? "");
    const start = offset;
    const end = start + surface.length;
    offset = end;
    return { ...token, surface_form: surface, start, end };
  });
}

/**
 * カッコ書き由来の読みをトークンへ適用。必要なら複数トークンを結合する。
 * @param {Array<object>} tokens
 * @param {Array<{ start: number, end: number, surface: string, reading: string }>} spans
 * @returns {Array<object>}
 */
export function applyInlineParenReadings(tokens, spans) {
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];
  if (!Array.isArray(spans) || spans.length === 0) return tokens;

  const spanned = withCharSpans(tokens);
  const used = new Set();
  const result = [];
  let index = 0;

  while (index < spanned.length) {
    const token = spanned[index];
    const span = spans.find(
      (s) =>
        !used.has(`${s.start}:${s.end}`) &&
        s.start === token.start &&
        s.end >= token.end
    );

    if (!span) {
      const { start, end, ...rest } = token;
      result.push(rest);
      index += 1;
      continue;
    }

    // span を覆うまでトークンを結合（今日＝今+日 など）
    let endIndex = index;
    let surface = "";
    while (endIndex < spanned.length && spanned[endIndex].start < span.end) {
      surface += spanned[endIndex].surface_form;
      endIndex += 1;
    }

    if (surface !== span.surface || spanned[endIndex - 1]?.end !== span.end) {
      const { start, end, ...rest } = token;
      result.push(rest);
      index += 1;
      continue;
    }

    used.add(`${span.start}:${span.end}`);
    const preserveKatakana = /[\u30a1-\u30f6]/.test(span.reading);
    result.push({
      ...token,
      surface_form: span.surface,
      reading: span.reading,
      pronunciation: span.reading,
      preserveKatakana,
      _inlineParen: true
    });
    index = endIndex;
  }

  return result;
}
