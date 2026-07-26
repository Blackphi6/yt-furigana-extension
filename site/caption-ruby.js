/**
 * 字幕 cue に読みAPIの結果を載せてルビ構造へ変換する（純関数）。
 *
 * 読みAPI は 1 リクエストずつレート制限があるので、cue を 1 行ずつ投げず
 * 改行で連結したチャンクにまとめ、返ってきた span を cue に割り戻す。
 */

import { rubyHtmlToSegments } from "./caption-formats.js?v=20260725a";

/** チャンク 1 つあたりの上限文字数（API は 8000 まで。余裕を持たせる） */
export const DEFAULT_CHUNK_CHARS = 1800;

/** チャンク内で cue を連結する区切り。形態素解析の切れ目にもなる */
export const CUE_SEPARATOR = "\n";

/**
 * cue を文字数でまとめる。返すのは cue のインデックス配列。
 * @param {{ text: string }[]} cues
 * @param {number} [maxChars]
 * @returns {number[][]}
 */
export function chunkCueIndices(cues, maxChars = DEFAULT_CHUNK_CHARS) {
  const limit = Math.max(1, Number(maxChars) || DEFAULT_CHUNK_CHARS);
  /** @type {number[][]} */
  const chunks = [];
  /** @type {number[]} */
  let current = [];
  let length = 0;

  for (let i = 0; i < (cues?.length || 0); i += 1) {
    const textLength = String(cues[i]?.text ?? "").length;
    const separator = current.length ? CUE_SEPARATOR.length : 0;
    if (current.length && length + separator + textLength > limit) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(i);
    length += (current.length > 1 ? CUE_SEPARATOR.length : 0) + textLength;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * チャンクの連結テキストと、各 cue の開始オフセット。
 * @param {{ text: string }[]} cues
 * @param {number[]} indices
 * @returns {{ text: string, offsets: number[] }}
 */
export function joinChunk(cues, indices) {
  const parts = [];
  const offsets = [];
  let offset = 0;

  for (let i = 0; i < indices.length; i += 1) {
    if (i > 0) offset += CUE_SEPARATOR.length;
    const text = String(cues[indices[i]]?.text ?? "");
    offsets.push(offset);
    parts.push(text);
    offset += text.length;
  }

  return { text: parts.join(CUE_SEPARATOR), offsets };
}

/**
 * 連結テキスト上の token を cue ごとに割り戻す（span は cue 内オフセットへ変換）。
 * cue をまたぐ token は捨てる（境界がずれた誤ルビを出さない）。
 * @param {{ text: string }[]} cues
 * @param {number[]} indices
 * @param {number[]} offsets
 * @param {{ span: [number, number], reading?: string }[]} tokens
 * @returns {Map<number, { span: [number, number], reading?: string }[]>}
 */
export function splitTokensByCue(cues, indices, offsets, tokens) {
  /** @type {Map<number, any[]>} */
  const byCue = new Map();
  for (const cueIndex of indices) byCue.set(cueIndex, []);

  for (const token of tokens || []) {
    const span = token?.span;
    if (!Array.isArray(span) || span.length < 2) continue;
    const [start, end] = span;
    if (!(Number.isFinite(start) && Number.isFinite(end)) || end <= start) continue;

    for (let i = 0; i < indices.length; i += 1) {
      const cueIndex = indices[i];
      const base = offsets[i];
      const length = String(cues[cueIndex]?.text ?? "").length;
      if (start < base || start >= base + length) continue;
      // cue の末尾をまたぐものは採用しない
      if (end > base + length) break;
      byCue.get(cueIndex).push({
        ...token,
        span: [start - base, end - base]
      });
      break;
    }
  }

  return byCue;
}

/**
 * cue のテキストと token からルビ構造を作る。
 * @param {string} text
 * @param {{ span: [number, number], reading?: string }[]} tokens
 * @param {(surface: string, reading: string) => string} buildRuby
 * @returns {{ text: string, ruby?: string }[]}
 */
export function textToRubySegments(text, tokens, buildRuby) {
  const source = String(text ?? "");
  /** @type {{ text: string, ruby?: string }[]} */
  const segments = [];

  const push = (segment) => {
    if (!segment?.text) return;
    const last = segments[segments.length - 1];
    if (last && last.ruby === undefined && segment.ruby === undefined) {
      last.text += segment.text;
      return;
    }
    segments.push(segment);
  };

  const sorted = [...(tokens || [])]
    .filter((t) => Array.isArray(t?.span))
    .sort((a, b) => a.span[0] - b.span[0]);

  let cursor = 0;
  for (const token of sorted) {
    const [start, end] = token.span;
    if (start < cursor) continue;
    if (start > cursor) push({ text: source.slice(cursor, start) });

    const surface = source.slice(start, end);
    const reading = String(token.reading || "");
    if (reading && surface) {
      for (const seg of rubyHtmlToSegments(buildRuby(surface, reading))) push(seg);
    } else {
      push({ text: surface });
    }
    cursor = end;
  }

  if (cursor < source.length) push({ text: source.slice(cursor) });
  return segments;
}

/** ルビを振る余地があるか（漢字を含むか） */
export function hasKanjiText(text) {
  return /[\u3400-\u9fff\uF900-\uFAFF]/.test(String(text || ""));
}
