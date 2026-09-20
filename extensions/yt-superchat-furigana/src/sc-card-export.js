/**
 * Super Chat → PNG。
 * YouTube の paid-message（ヘッダー＋本文の2段）を横長で再現。
 * アーカイブ全件は DOM に無いのでスクショではなく同じ見た目を描画する。
 */

import {
  insertCaptionSoftBreaks,
  parseJapanesePhrases
} from "../../../src/caption-line-break.js";
import { superChatColorsFromAmount } from "./sc-ledger.js";

/**
 * @typedef {import("./sc-ledger.js").ScLedgerEntry} ScLedgerEntry
 */

/** StreamYard 系オーバーレイ向けの横長（チャット欄幅ではなく配信用） */
export const CARD_W = 1280;
const PAD_X = 20;
const AVATAR = 56;
const HEADER_H = 72;
const LINE = 30;
/** ルビあり本文。rt 分を上に確保 */
const LINE_RUBY = 46;
const RUBY_FONT =
  "500 12px system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
const RADIUS = 12;
/** 本文の上下余白（見た目の息苦しさ対策） */
const BODY_PAD_Y = 28;

/**
 * @param {string} s
 */
export function sanitizeFilenamePart(s) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

/**
 * @param {ScLedgerEntry} entry
 */
export function buildScCardFilename(entry) {
  const tc = sanitizeFilenamePart(
    entry.videoTimecode ||
      (entry.videoTimecodeSec != null
        ? `t${Math.floor(entry.videoTimecodeSec)}`
        : "live")
  );
  const author = sanitizeFilenamePart(entry.author || "anon");
  const amount = sanitizeFilenamePart(entry.amount || "sc");
  return `sc_${tc}_${author}_${amount}.png`;
}

/**
 * @param {string} hex
 * @param {number} factor 1より小で暗く
 */
export function shadeHex(hex, factor) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#0e4d92";
  const f = Math.max(0, Math.min(1.5, Number(factor) || 1));
  const parts = [1, 3, 5].map((i) => {
    const n = Math.round(parseInt(hex.slice(i, i + 2), 16) * f);
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

/**
 * 背景の明るさから文字色を決める（YouTube と同じく、暗い帯は白・明るい帯は黒）。
 * @param {string} hex
 */
export function contrastFgForHex(hex) {
  const h = String(hex || "");
  const m = h.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#111111";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.56 ? "#111111" : "#ffffff";
}

/**
 * YouTube SC のヘッダー／本文色。
 * 実色が無いときは金額帯の公式色。
 * @param {ScLedgerEntry | { colorHex?: string | null, headerColorHex?: string | null, amount?: string }} entry
 */
export function resolveYtScColors(entry) {
  const storedBody =
    entry.colorHex && /^#[0-9a-fA-F]{6}$/.test(entry.colorHex)
      ? entry.colorHex.toLowerCase()
      : "";
  const storedHeader =
    entry.headerColorHex && /^#[0-9a-fA-F]{6}$/.test(entry.headerColorHex)
      ? entry.headerColorHex.toLowerCase()
      : "";
  const fromAmount = superChatColorsFromAmount(entry.amount || "");
  const body = storedBody || fromAmount?.colorHex || "#1e88e5";
  const header =
    storedHeader || fromAmount?.headerColorHex || (storedBody ? shadeHex(body, 0.72) : "#1565c0");
  const fg = contrastFgForHex(body);
  return {
    header,
    body,
    fg,
    muted: fg === "#ffffff" ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.72)"
  };
}

/** @deprecated 互換用 */
export function resolveCardColors(colorHex) {
  const { body, fg, muted } = resolveYtScColors({ colorHex });
  return { bg: body, fg, muted };
}

/**
 * 1語が幅を超えるときだけ文字単位で折る。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} phrase
 * @param {number} maxWidth
 * @returns {string[]}
 */
function splitPhraseByWidth(ctx, phrase, maxWidth) {
  const chars = [...String(phrase || "")];
  if (!chars.length) return [];
  /** @type {string[]} */
  const out = [];
  let chunk = "";
  for (const ch of chars) {
    const test = chunk + ch;
    if (chunk && ctx.measureText(test).width > maxWidth) {
      out.push(chunk);
      chunk = ch;
    } else {
      chunk = test;
    }
  }
  if (chunk) out.push(chunk);
  return out;
}

/**
 * BudouX 句で折り返した行。描画と行数見積もりで同じ規則にする。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapPlainTextLines(ctx, text, maxWidth) {
  const raw = String(text || "");
  if (!raw) return [];
  const phrases = parseJapanesePhrases(raw);
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const phrase of phrases) {
    const test = line + phrase;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      if (ctx.measureText(phrase).width > maxWidth) {
        const chunks = splitPhraseByWidth(ctx, phrase, maxWidth);
        line = chunks.pop() || "";
        lines.push(...chunks);
      } else {
        line = phrase;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 * @param {number} lineHeight
 * @returns {number} 次の y
 */
export function wrapFillText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = wrapPlainTextLines(ctx, text, maxWidth);
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/**
 * 折り返し行数（描画と同じ規則）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 */
export function countWrapLines(ctx, text, maxWidth) {
  return wrapPlainTextLines(ctx, text, maxWidth).length;
}

/**
 * @param {string} s
 */
export function escapeScHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} s
 */
export function decodeScEntities(s) {
  return String(s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * convert() の ruby HTML → canvas 用ラン。
 * wrapFuriganaWord の span は無視し、ruby / 生テキストだけ拾う。
 * @param {string} html
 * @returns {{ surface: string, reading: string }[]}
 */
export function parseFuriganaRuns(html) {
  const src = String(html || "");
  if (!src) return [];
  /** @type {{ surface: string, reading: string }[]} */
  const runs = [];
  const re =
    /<ruby\b[^>]*>([\s\S]*?)<\/ruby>|<\/?span\b[^>]*>|<\/?rp\b[^>]*>|([^<]+)/gi;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] != null) {
      const rts = [];
      const base = m[1]
        .replace(/<rt\b[^>]*>([\s\S]*?)<\/rt>/gi, (_, r) => {
          rts.push(decodeScEntities(r.replace(/<[^>]+>/g, "")));
          return "";
        })
        .replace(/<\/?r[bp]\b[^>]*>/gi, "");
      const surface = decodeScEntities(base.replace(/<[^>]+>/g, ""));
      if (surface) runs.push({ surface, reading: rts.join("") });
      continue;
    }
    if (m[2]) {
      const surface = decodeScEntities(m[2]);
      if (surface) runs.push({ surface, reading: "" });
    }
  }
  return runs;
}

/**
 * ルビ run を BudouX 句境界で原子に分ける。句を跨ぐ run は読みを捨てる。
 * @param {{ surface?: string, reading?: string }[]} runs
 * @param {string[]} phrases
 * @returns {{ surface: string, reading: string }[]}
 */
export function splitRubyRunsByPhrases(runs, phrases) {
  /** @type {{ surface: string, reading: string }[]} */
  const atoms = [];
  let phraseIdx = 0;
  let phraseUsed = 0;
  for (const run of runs || []) {
    let surface = String(run?.surface || "");
    let reading = String(run?.reading || "");
    while (surface) {
      while (
        phraseIdx < phrases.length &&
        phraseUsed >= phrases[phraseIdx].length
      ) {
        phraseIdx += 1;
        phraseUsed = 0;
      }
      const phrase = phrases[phraseIdx] || "";
      const remain = Math.max(0, phrase.length - phraseUsed);
      if (!remain) {
        atoms.push({ surface, reading });
        break;
      }
      if (surface.length <= remain) {
        atoms.push({ surface, reading });
        phraseUsed += surface.length;
        surface = "";
        reading = "";
        continue;
      }
      atoms.push({ surface: surface.slice(0, remain), reading: "" });
      surface = surface.slice(remain);
      reading = "";
      phraseUsed += remain;
    }
  }
  return atoms;
}

/**
 * ルビセルの折り返し。ctx.font は本文フォントであること。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ surface?: string, reading?: string }[]} runs
 * @param {number} maxWidth
 * @returns {{ surface: string, reading: string, width: number }[][]}
 */
export function layoutRubyRuns(ctx, runs, maxWidth) {
  const bodyFont = ctx.font;
  /** @type {{ surface: string, reading: string, width: number }[][]} */
  const lines = [];
  /** @type {{ surface: string, reading: string, width: number }[]} */
  let row = [];
  let used = 0;

  const pushRow = () => {
    if (row.length) lines.push(row);
    row = [];
    used = 0;
  };

  const measureCell = (surface, reading) => {
    ctx.font = bodyFont;
    const sw = ctx.measureText(surface).width;
    let rw = 0;
    if (reading) {
      ctx.font = RUBY_FONT;
      rw = ctx.measureText(reading).width;
      ctx.font = bodyFont;
    }
    return Math.max(sw, rw);
  };

  const sourceRuns = (runs || [])
    .map((run) => ({
      surface: String(run?.surface || ""),
      reading: String(run?.reading || "")
    }))
    .filter((run) => run.surface);
  const visible = sourceRuns.map((r) => r.surface).join("");
  const phrases = parseJapanesePhrases(visible);
  const packed =
    phrases.join("") === visible
      ? splitRubyRunsByPhrases(sourceRuns, phrases)
      : sourceRuns;

  for (const run of packed) {
    const surface = run.surface;
    const reading = run.reading;
    if (!surface) continue;
    const width = measureCell(surface, reading);
    if (width > maxWidth) {
      pushRow();
      let chunk = "";
      for (const ch of [...surface]) {
        const test = chunk + ch;
        if (ctx.measureText(test).width > maxWidth && chunk) {
          row.push({
            surface: chunk,
            reading: "",
            width: ctx.measureText(chunk).width
          });
          pushRow();
          chunk = ch;
        } else {
          chunk = test;
        }
      }
      if (chunk) {
        row.push({
          surface: chunk,
          reading: "",
          width: ctx.measureText(chunk).width
        });
      }
      continue;
    }
    if (used + width > maxWidth && row.length) pushRow();
    row.push({ surface, reading, width });
    used += width;
  }
  pushRow();
  ctx.font = bodyFont;
  return lines;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ surface: string, reading: string, width: number }[][]} lines
 * @param {number} x
 * @param {number} y 先頭行の本文 baseline
 * @param {number} lineHeight
 * @returns {number} 次の y
 */
export function fillRubyRunLines(ctx, lines, x, y, lineHeight) {
  const bodyFont = ctx.font;
  let cy = y;
  for (const row of lines || []) {
    let cx = x;
    for (const cell of row) {
      if (cell.reading) {
        ctx.font = RUBY_FONT;
        const rw = ctx.measureText(cell.reading).width;
        ctx.fillText(
          cell.reading,
          cx + Math.max(0, (cell.width - rw) / 2),
          cy - 18
        );
      }
      ctx.font = bodyFont;
      ctx.fillText(cell.surface, cx, cy);
      cx += cell.width;
    }
    cy += lineHeight;
  }
  ctx.font = bodyFont;
  return cy;
}

/**
 * @param {ScLedgerEntry} entry
 */
export function formatScTimecode(entry) {
  if (entry?.videoTimecode) return String(entry.videoTimecode);
  if (entry?.videoTimecodeSec != null) return formatSec(entry.videoTimecodeSec);
  return "";
}

/**
 * プレビュー用 HTML カード（PNG と同じ配色）。authorHtml / messageHtml は escape 済み or ruby HTML。
 * @param {ScLedgerEntry} entry
 * @param {{ authorHtml?: string, messageHtml?: string }} [opts]
 */
export function buildScPreviewCardHtml(entry, opts = {}) {
  const { header, body, fg } = resolveYtScColors(entry);
  const authorHtml = opts.authorHtml || escapeScHtml(entry.author || "—");
  const rawMessage = String(entry.message || "").trim();
  const messageHtml = insertCaptionSoftBreaks(
    opts.messageHtml != null && opts.messageHtml !== ""
      ? opts.messageHtml
      : escapeScHtml(rawMessage),
    { allPhrases: true }
  );
  const photo = String(entry.authorPhotoUrl || "").trim();
  const avatar = /^https?:\/\//i.test(photo)
    ? `<img class="ytscf-sc-preview__avatar" src="${escapeScHtml(photo)}" alt="" />`
    : `<span class="ytscf-sc-preview__avatar ytscf-sc-preview__avatar--ph" aria-hidden="true"></span>`;
  const amount = escapeScHtml(entry.amount || "Super Chat");
  const tc = formatScTimecode(entry);
  const bodyBlock = rawMessage
    ? `<div class="ytscf-sc-preview__body" style="background:${body};color:${fg}">${messageHtml}</div>`
    : "";
  const tcBlock = tc
    ? `<div class="ytscf-sc-preview__tc">▶ ${escapeScHtml(tc)}</div>`
    : "";
  return `<div class="ytscf-sc-preview__ytcard">
    <div class="ytscf-sc-preview__header" style="background:${header};color:${fg}">
      ${avatar}
      <div class="ytscf-sc-preview__author">${authorHtml}</div>
      <div class="ytscf-sc-preview__amount">${amount}</div>
    </div>
    ${bodyBlock}
    ${tcBlock}
  </div>`;
}

/**
 * host_permissions 付き fetch で CORS を避け、キャンバス汚染を防ぐ。
 * @param {string | null | undefined} url
 * @returns {Promise<ImageBitmap | null>}
 */
export async function loadAuthorPhotoBitmap(url) {
  const src = String(url || "").trim();
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const res = await fetch(src, { credentials: "omit", mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageBitmap} bmp
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawCircleImage(ctx, bmp, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(bmp, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * @param {ScLedgerEntry} entry
 * @param {{ messageHtml?: string }} [opts] messageHtml があれば本文にルビを描く
 * @returns {Promise<Blob>}
 */
export async function renderScCardPngBlob(entry, opts = {}) {
  const { header, body, fg } = resolveYtScColors(entry);
  const photo = await loadAuthorPhotoBitmap(entry.authorPhotoUrl);
  const message = String(entry.message || "").trim();
  const hasMessage = Boolean(message);
  const rubyRuns = opts.messageHtml ? parseFuriganaRuns(opts.messageHtml) : [];
  const useRuby = rubyRuns.some((r) => r.reading);
  const tc = formatScTimecode(entry);
  const tcBand = tc ? 28 : 0;

  // 本文行数は実測（フォント設定後）。仮 canvas で測る
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("canvas unsupported");
  measure.font =
    "500 24px system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  const msgMaxW = CARD_W - PAD_X * 2 - 8;
  const rubyLines = useRuby ? layoutRubyRuns(measure, rubyRuns, msgMaxW) : null;
  const lineH = useRuby ? LINE_RUBY : LINE;
  const lineCount = hasMessage
    ? Math.max(1, rubyLines ? rubyLines.length : countWrapLines(measure, message, msgMaxW))
    : 0;
  const textBlockH = lineCount * lineH;
  const bodyH = hasMessage ? BODY_PAD_Y * 2 + textBlockH : 0;
  const height = HEADER_H + bodyH + tcBand;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");

  // 全体の角丸クリップ
  roundRect(ctx, 0, 0, CARD_W, height, RADIUS);
  ctx.clip();

  // ヘッダー帯（YouTube #header）
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, CARD_W, HEADER_H);

  // 本文帯（YouTube #content）
  if (hasMessage) {
    ctx.fillStyle = body;
    ctx.fillRect(0, HEADER_H, CARD_W, bodyH);
  }

  // フッタ（編集メタ。配信用カード本体とは切り離す）
  if (tc) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, HEADER_H + bodyH, CARD_W, tcBand);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "600 15px system-ui, 'Segoe UI', sans-serif";
    const label = `▶ ${tc}`;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, CARD_W - PAD_X - tw, HEADER_H + bodyH + 19);
  }

  const avatarCx = PAD_X + AVATAR / 2;
  const avatarCy = HEADER_H / 2;
  if (photo) {
    drawCircleImage(ctx, photo, avatarCx, avatarCy, AVATAR / 2);
    photo.close?.();
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const textLeft = PAD_X + AVATAR + 14;
  const amount = String(entry.amount || "Super Chat");
  const baseline = HEADER_H / 2 + 10;
  ctx.font = "700 28px system-ui, 'Segoe UI', sans-serif";
  const amountW = ctx.measureText(amount).width;
  const amountX = CARD_W - PAD_X - amountW;

  ctx.fillStyle = fg;
  ctx.fillText(amount, amountX, baseline);

  // 作者名（金額に被らないよう省略）
  ctx.font = "600 26px system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
  const author = String(entry.author || "—");
  let authorDraw = author;
  const maxAuthorW = Math.max(40, amountX - 16 - textLeft);
  while (
    authorDraw.length > 1 &&
    ctx.measureText(authorDraw).width > maxAuthorW
  ) {
    authorDraw = `${[...authorDraw].slice(0, -2).join("")}…`;
  }
  ctx.fillText(authorDraw, textLeft, baseline);

  if (hasMessage) {
    ctx.fillStyle = fg;
    ctx.font =
      "500 24px system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    // 本文帯の縦中央にテキストブロックを置く（baseline は先頭行）
    const rubyLift = useRuby ? 20 : lineH * 0.72;
    const firstBaseline =
      HEADER_H + (bodyH - textBlockH) / 2 + rubyLift;
    if (rubyLines) {
      fillRubyRunLines(ctx, rubyLines, PAD_X + 8, firstBaseline, lineH);
    } else {
      wrapFillText(ctx, message, PAD_X + 8, firstBaseline, msgMaxW, lineH);
    }
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
  return blob;
}

/**
 * @param {number} sec
 */
function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.documentElement.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * @param {ScLedgerEntry} entry
 * @param {{ messageHtml?: string }} [opts]
 */
export async function downloadScCardPng(entry, opts = {}) {
  const blob = await renderScCardPngBlob(entry, opts);
  downloadBlob(blob, buildScCardFilename(entry));
}

/**
 * PNG をクリップボードへ（ユーザー操作起点で呼ぶ）。
 * @param {ScLedgerEntry} entry
 * @param {{ messageHtml?: string }} [opts]
 */
export async function copyScCardPngToClipboard(entry, opts = {}) {
  const blob = await renderScCardPngBlob(entry, opts);
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("この環境ではクリップボードに画像をコピーできません");
  }
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob })
  ]);
}

/**
 * @param {ScLedgerEntry[]} entries
 * @param {{
 *   delayMs?: number,
 *   onProgress?: (i: number, n: number) => void,
 *   signal?: AbortSignal,
 *   resolveOpts?: (entry: ScLedgerEntry) => Promise<{ messageHtml?: string }> | { messageHtml?: string }
 * }} [opts]
 */
export async function downloadScCardPngBatch(entries, opts = {}) {
  const delayMs = Number(opts.delayMs) || 350;
  const list = entries || [];
  for (let i = 0; i < list.length; i += 1) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.(i + 1, list.length);
    const extra = (await opts.resolveOpts?.(list[i])) || {};
    await downloadScCardPng(list[i], extra);
    if (i < list.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
