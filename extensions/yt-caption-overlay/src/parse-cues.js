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
      html: escapeHtml(cue.text).replace(/\n/g, "<br />")
    }))
  };
}

/**
 * 現在時刻に重なる cue を返す（複数行なら結合）。
 * @param {OverlayCue[]} cues
 * @param {number} timeMs
 * @returns {OverlayCue | null}
 */
export function findActiveCue(cues, timeMs) {
  const list = Array.isArray(cues) ? cues : [];
  const t = Math.max(0, Number(timeMs) || 0);
  const hits = list.filter((cue) => t >= cue.startMs && t < cue.endMs);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  return {
    startMs: hits[0].startMs,
    endMs: hits[hits.length - 1].endMs,
    text: hits.map((c) => c.text).join("\n"),
    html: hits.map((c) => c.html).join("<br />")
  };
}
