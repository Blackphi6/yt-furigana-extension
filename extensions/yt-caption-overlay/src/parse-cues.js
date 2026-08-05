/**
 * 字幕ソース → オーバーレイ用 cue（html 付き）。
 * timedtext API は使わない。ローカルファイルの中身だけを見る。
 */

import { parseCaptions, parseTimestamp, unescapeXml } from "../../../site/caption-formats.js";

/**
 * @typedef {{ startMs: number, endMs: number, text: string, html: string }} OverlayCue
 */

/**
 * WebVTT / SRT で <ruby> を残しつつ他タグを落とす。
 * @param {string} source
 * @returns {OverlayCue[]}
 */
function parseSrtOrVttWithRuby(source) {
  const text = String(source || "").replace(/\r\n?/g, "\n");
  const cues = [];
  const arrow =
    /(\d{1,2}:\d{1,2}(?::\d{1,2})?[.,]?\d*)\s*-->\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?[.,]?\d*)/;

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (!lines.length) continue;
    const timeIndex = lines.findIndex((line) => arrow.test(line));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(arrow);
    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);
    if (startMs === null || endMs === null) continue;

    let body = lines.slice(timeIndex + 1).join("\n");
    // ruby / rt 以外のタグは落とす
    body = body.replace(/<(?!\/?(?:ruby|rt)\b)[^>]+>/gi, "");
    body = unescapeXml(body);
    const plain = body.replace(/<[^>]+>/g, "").trim();
    if (!plain) continue;
    cues.push({
      startMs,
      endMs: endMs <= startMs ? startMs + 1000 : endMs,
      text: plain,
      // 明示改行だけ。半角スペースは YouTube ネイティブ行を見てから決める
      html: body.replace(/\n/g, "<br />")
    });
  }
  return cues;
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 表示用 HTML（明示改行のみ）。スペース→改行は native-breaks 側。
 * @param {string} html
 * @returns {string}
 */
export function toOverlayHtml(html) {
  return String(html || "").replace(/\n/g, "<br />");
}

/**
 * @param {string} source
 * @returns {{ format: string, cues: OverlayCue[] }}
 */
export function parseOverlayCaptions(source) {
  const raw = String(source || "").trim();
  if (!raw) return { format: "unknown", cues: [] };

  if (/-->/.test(raw) && (/^WEBVTT/i.test(raw) || /<ruby[\s>]/i.test(raw))) {
    const cues = parseSrtOrVttWithRuby(raw);
    if (cues.length) {
      return { format: /^WEBVTT/i.test(raw) ? "vtt" : "srt", cues };
    }
  }

  const { format, cues } = parseCaptions(raw);
  return {
    format,
    cues: cues.map((cue) => ({
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: cue.text,
      html: toOverlayHtml(escapeHtml(cue.text))
    }))
  };
}

/**
 * 現在時刻に重なる cue を 1 つだけ返す。
 *
 * 字幕は時間が重なる cue（ロール表示・分割）を含むことがある。
 * それらを連結すると本来 1 行の字幕が 2 行に割れてしまうため、
 * 「最後に始まった＝いま画面にあるべき」cue を優先し、同時なら長い方を採る。
 * cue 自身が持つ改行（\n → <br />）はそのまま尊重する。
 *
 * @param {OverlayCue[]} cues
 * @param {number} timeMs
 * @returns {OverlayCue | null}
 */
export function findActiveCue(cues, timeMs) {
  const list = Array.isArray(cues) ? cues : [];
  const t = Math.max(0, Number(timeMs) || 0);

  /** @type {OverlayCue | null} */
  let best = null;
  for (const cue of list) {
    if (t < cue.startMs || t >= cue.endMs) continue;
    if (!best) {
      best = cue;
      continue;
    }
    if (
      cue.startMs > best.startMs ||
      (cue.startMs === best.startMs && cue.text.length > best.text.length)
    ) {
      best = cue;
    }
  }
  return best;
}
