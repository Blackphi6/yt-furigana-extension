/**
 * 字幕フォーマットの読み書き（純関数・Node でもブラウザでも動く）。
 *
 * 入力: SRT / WebVTT / timedtext json3 / srv3(ytt) / srv1
 * 出力: ルビを「文字の上」に載せられる形式のみ
 *   - WebVTT   … <ruby><rt> がネイティブ仕様
 *   - SRV3/ytt … <pen rb> + <s p> の並びで YouTube が組む
 *   - TTML     … tts:ruby（YouTube への字幕アップロードで使える）
 * SRT はルビを表現できないので意図的に非対応。
 *
 * @typedef {{ startMs: number, endMs: number, text: string }} Cue
 * @typedef {{ text: string, ruby?: string }} RubySegment
 * @typedef {{ startMs: number, endMs: number, segments: RubySegment[] }} RubyCue
 */

/** SRV3 の pen rb 値。1=ルビの親, 2=括弧, 4=ルビを上, 5=ルビを下 */
export const SRV3_RB_BASE = 1;
export const SRV3_RB_PAREN = 2;
export const SRV3_RB_TEXT_ABOVE = 4;
export const SRV3_RB_TEXT_BELOW = 5;

const XML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'"
};

/**
 * @param {string} value
 */
export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} value
 */
export function unescapeXml(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, name) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    const mapped = XML_ENTITIES[name];
    return mapped === undefined ? all : mapped;
  });
}

/**
 * ミリ秒 → HH:MM:SS.mmm
 * @param {number} ms
 * @param {string} [msSeparator]
 */
export function formatTimestamp(ms, msSeparator = ".") {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const milli = total % 1000;
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSeparator}${pad(milli, 3)}`;
}

/**
 * HH:MM:SS[.,]mmm / MM:SS.mmm → ミリ秒
 * @param {string} value
 * @returns {number | null}
 */
export function parseTimestamp(value) {
  const m = String(value || "")
    .trim()
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, hh, mm, ss, frac] = m;
  const millis = frac ? Number(frac.padEnd(3, "0")) : 0;
  return (
    Number(hh || 0) * 3_600_000 + Number(mm) * 60_000 + Number(ss) * 1000 + millis
  );
}

function normalizeCue(cue) {
  const startMs = Math.max(0, Math.round(Number(cue.startMs) || 0));
  let endMs = Math.round(Number(cue.endMs) || 0);
  // 終了が無い／逆転しているものは最低 1 秒だけ表示させる
  if (!Number.isFinite(endMs) || endMs <= startMs) endMs = startMs + 1000;
  return { startMs, endMs, text: String(cue.text ?? "").trim() };
}

/**
 * @param {Cue[]} cues
 */
function finalizeCues(cues) {
  return cues.map(normalizeCue).filter((cue) => cue.text.length > 0);
}

/**
 * SRT / WebVTT の共通パーサ。
 * @param {string} source
 * @returns {Cue[]}
 */
export function parseSrtOrVtt(source) {
  const text = String(source || "").replace(/\r\n?/g, "\n");
  const cues = [];
  const arrow = /(\d{1,2}:\d{1,2}(?::\d{1,2})?[.,]?\d*)\s*-->\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?[.,]?\d*)/;

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (!lines.length) continue;

    const timeIndex = lines.findIndex((line) => arrow.test(line));
    if (timeIndex < 0) continue;

    const match = lines[timeIndex].match(arrow);
    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);
    if (startMs === null || endMs === null) continue;

    // WebVTT のタグ（<v Foo> <c.classname> など）は落として素のテキストにする
    const body = lines
      .slice(timeIndex + 1)
      .join("\n")
      .replace(/<\/?[^>]+>/g, "");
    cues.push({ startMs, endMs, text: unescapeXml(body) });
  }

  return finalizeCues(cues);
}

/**
 * timedtext json3（{ events: [{ tStartMs, dDurationMs, segs }] }）。
 * @param {unknown} payload  JSON 文字列またはパース済みオブジェクト
 * @returns {Cue[]}
 */
export function parseJson3(payload) {
  let data = payload;
  if (typeof payload === "string") {
    try {
      data = JSON.parse(payload);
    } catch {
      return [];
    }
  }

  const events = Array.isArray(data?.events) ? data.events : [];
  const cues = [];
  for (const event of events) {
    const segs = Array.isArray(event?.segs) ? event.segs : [];
    const text = segs
      .map((seg) => String(seg?.utf8 ?? ""))
      .join("")
      .replace(/\u200b/g, "");
    if (!text.trim()) continue;
    const startMs = Number(event.tStartMs) || 0;
    const durationMs = Number(event.dDurationMs) || 0;
    cues.push({ startMs, endMs: startMs + durationMs, text });
  }
  return finalizeCues(cues);
}

/**
 * srv3 / srv2 / srv1 の XML。DOMParser 無しで動かすため部分的な正規表現パーサ。
 * @param {string} source
 * @returns {Cue[]}
 */
export function parseTimedTextXml(source) {
  const xml = String(source || "");
  const cues = [];

  // srv3 / srv2: <p t="1000" d="2500">…</p> または <text t= d=>
  const pRe = /<(p|text)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pRe.exec(xml))) {
    const attrs = match[2];
    const inner = match[3];

    const t = attrs.match(/\bt="(-?\d+)"/);
    const d = attrs.match(/\bd="(-?\d+)"/);
    const start = attrs.match(/\bstart="([\d.]+)"/);
    const dur = attrs.match(/\bdur="([\d.]+)"/);

    let startMs;
    let endMs;
    if (t) {
      startMs = Number(t[1]);
      endMs = startMs + (d ? Number(d[1]) : 0);
    } else if (start) {
      startMs = Math.round(Number(start[1]) * 1000);
      endMs = startMs + Math.round(Number(dur?.[1] ?? 0) * 1000);
    } else {
      continue;
    }

    // <s> の中身を連結。ルビ用の括弧 pen は落とさず素直に読む
    const text = unescapeXml(inner.replace(/<[^>]+>/g, ""));
    cues.push({ startMs, endMs, text });
  }

  return finalizeCues(cues);
}

/**
 * 中身を見てフォーマットを判定し、cue 配列にする。
 * @param {string} source
 * @returns {{ format: "vtt" | "srt" | "json3" | "xml" | "text" | "unknown", cues: Cue[] }}
 */
export function parseCaptions(source) {
  const text = String(source || "").trim();
  if (!text) return { format: "unknown", cues: [] };

  if (text.startsWith("{") || text.startsWith("[")) {
    const cues = parseJson3(text);
    if (cues.length) return { format: "json3", cues };
  }

  if (text.startsWith("<")) {
    const cues = parseTimedTextXml(text);
    if (cues.length) return { format: "xml", cues };
  }

  if (/-->/.test(text)) {
    const cues = parseSrtOrVtt(text);
    if (cues.length) {
      return { format: /^WEBVTT/i.test(text) ? "vtt" : "srt", cues };
    }
  }

  return { format: "unknown", cues: [] };
}

/**
 * buildRuby() が返すルビ HTML を、書き出し用の構造に戻す。
 * HTML を直接各フォーマットへ流し込まないための橋渡し。
 * @param {string} html
 * @returns {RubySegment[]}
 */
export function rubyHtmlToSegments(html) {
  const source = String(html || "");
  /** @type {RubySegment[]} */
  const segments = [];

  const pushText = (raw) => {
    const text = unescapeXml(raw);
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.ruby === undefined) last.text += text;
    else segments.push({ text });
  };

  const re = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/g;
  let cursor = 0;
  let match;
  while ((match = re.exec(source))) {
    if (match.index > cursor) pushText(source.slice(cursor, match.index));
    const base = unescapeXml(match[1].replace(/<[^>]+>/g, ""));
    const ruby = unescapeXml(match[2].replace(/<[^>]+>/g, ""));
    if (base) segments.push(ruby ? { text: base, ruby } : { text: base });
    cursor = re.lastIndex;
  }
  if (cursor < source.length) pushText(source.slice(cursor));

  return segments;
}

/**
 * @param {RubySegment[]} segments
 */
export function segmentsToPlainText(segments) {
  return (segments || []).map((seg) => seg.text).join("");
}

/**
 * ルビ非対応環境向けの 漢字(かんじ) 表記。
 * @param {RubySegment[]} segments
 */
export function segmentsToParenText(segments) {
  return (segments || [])
    .map((seg) => (seg.ruby ? `${seg.text}(${seg.ruby})` : seg.text))
    .join("");
}

/**
 * @param {RubyCue[]} cues
 * @returns {string}
 */
export function toWebVtt(cues) {
  const blocks = (cues || []).map((cue, index) => {
    const body = cue.segments
      .map((seg) =>
        seg.ruby
          ? `<ruby>${escapeXml(seg.text)}<rt>${escapeXml(seg.ruby)}</rt></ruby>`
          : escapeXml(seg.text)
      )
      .join("");
    const time = `${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}`;
    return `${index + 1}\n${time}\n${body}`;
  });

  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/**
 * YouTube SRV3（.ytt）。ルビは pen の並びで表現し、
 * ルビ非対応なモバイルでは 漢字(かんじ) として読める形に落ちる。
 * @param {RubyCue[]} cues
 * @param {{ rubyBelow?: boolean }} [options]
 * @returns {string}
 */
export function toSrv3(cues, options = {}) {
  const rubyPen = options.rubyBelow ? SRV3_RB_TEXT_BELOW : SRV3_RB_TEXT_ABOVE;

  const head = [
    `    <pen id="1" rb="${SRV3_RB_BASE}"/>`,
    `    <pen id="2" rb="${SRV3_RB_PAREN}"/>`,
    `    <pen id="3" rb="${rubyPen}"/>`
  ].join("\n");

  const body = (cues || [])
    .map((cue) => {
      const inner = cue.segments
        .map((seg) => {
          if (!seg.ruby) return escapeXml(seg.text);
          return (
            `<s p="1">${escapeXml(seg.text)}</s>` +
            `<s p="2">(</s>` +
            `<s p="3">${escapeXml(seg.ruby)}</s>` +
            `<s p="2">)</s>`
          );
        })
        .join("");
      const duration = Math.max(1, cue.endMs - cue.startMs);
      return `    <p t="${cue.startMs}" d="${duration}">${inner}</p>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<timedtext format="3">',
    "  <head>",
    head,
    "  </head>",
    "  <body>",
    body,
    "  </body>",
    "</timedtext>",
    ""
  ].join("\n");
}

/**
 * TTML2（tts:ruby）。YouTube の字幕アップロードでも受け付けられる。
 * @param {RubyCue[]} cues
 * @param {{ lang?: string }} [options]
 * @returns {string}
 */
export function toTtml(cues, options = {}) {
  const lang = options.lang || "ja";
  const body = (cues || [])
    .map((cue) => {
      const inner = cue.segments
        .map((seg) => {
          if (!seg.ruby) return escapeXml(seg.text);
          return (
            '<span tts:ruby="container">' +
            `<span tts:ruby="base">${escapeXml(seg.text)}</span>` +
            `<span tts:ruby="text">${escapeXml(seg.ruby)}</span>` +
            "</span>"
          );
        })
        .join("");
      return `        <p begin="${formatTimestamp(cue.startMs)}" end="${formatTimestamp(
        cue.endMs
      )}">${inner}</p>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml"',
    '    xmlns:tts="http://www.w3.org/ns/ttml#styling"',
    `    xml:lang="${escapeXml(lang)}">`,
    "  <body>",
    "    <div>",
    body,
    "    </div>",
    "  </body>",
    "</tt>",
    ""
  ].join("\n");
}

/** 書き出せる形式（ルビを載せられるものだけ） */
export const EXPORT_FORMATS = [
  {
    id: "vtt",
    label: "WebVTT (.vtt)",
    extension: "vtt",
    mime: "text/vtt",
    note: "<ruby> が仕様に入っている標準形式"
  },
  {
    id: "srv3",
    label: "YouTube SRV3 (.ytt)",
    extension: "ytt",
    mime: "application/xml",
    note: "YouTube にそのままアップロードできる。PC はルビ表示、モバイルは 漢字(かんじ)"
  },
  {
    id: "ttml",
    label: "TTML (.ttml)",
    extension: "ttml",
    mime: "application/ttml+xml",
    note: "tts:ruby。編集ソフト向け"
  }
];

/**
 * @param {"vtt" | "srv3" | "ttml"} format
 * @param {RubyCue[]} cues
 * @param {{ rubyBelow?: boolean, lang?: string }} [options]
 */
export function serializeCaptions(format, cues, options = {}) {
  if (format === "vtt") return toWebVtt(cues);
  if (format === "srv3") return toSrv3(cues, options);
  if (format === "ttml") return toTtml(cues, options);
  throw new Error(`unsupported export format: ${format}`);
}
