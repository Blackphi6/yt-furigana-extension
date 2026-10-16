/**
 * 読み API（POST /v1/readings）クライアント。拡張の callReadingApi と同じ要求・応答の扱い。
 */
import { PUBLIC_READING_API_URL } from "../../../src/default-settings.js";
import {
  buildReadingApiHeaders,
  buildReadingApiRequest,
  normalizeReadingApiUrl,
  parseReadingApiResponse
} from "../../../src/reading-api.js";

const DEFAULT_TIMEOUT_MS = 30_000;
/** 1 回にまとめる文字数の上限（サーバーは 8000 字まで。長いほど 1 回の待ちが長くなる） */
export const BATCH_MAX_CHARS = 1500;

/**
 * @param {true | { url?: string, apiKey?: string, timeoutMs?: number } | undefined} option
 * @returns {{ endpoint: string, healthUrl: string, apiKey: string, timeoutMs: number } | null}
 */
export function resolveReadingApiOption(option) {
  if (!option) return null;
  const config = option === true ? {} : option;
  const timeoutMs = Number(config.timeoutMs);
  const endpoint = normalizeReadingApiUrl(config.url || PUBLIC_READING_API_URL);
  return {
    endpoint,
    healthUrl: endpoint.replace(/\/v1\/readings$/i, "/health"),
    apiKey: String(config.apiKey || ""),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

/** 無料枠のサーバーは眠っていると起動に数十秒かかるので、先に起こしておく（本文は送らない） */
export function warmReadingApi(api) {
  return fetch(api.healthUrl, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
}

/**
 * 複数行を改行でつないで 1 回で問い合わせ、行ごとのルビ HTML（語ごとの span 付き）にする。
 * API が読みを返さなかった行は null（手元のエンジンで描く）。通信・HTTP の失敗は例外。
 * @param {string[]} lines
 * @param {{ endpoint: string, apiKey: string, timeoutMs: number }} api
 * @param {Record<string, string>} userReadings
 * @returns {Promise<Map<string, string | null>>}
 */
export async function fetchReadingApiLines(lines, api, userReadings) {
  const joined = lines.join("\n");
  const response = await fetch(api.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(api.timeoutMs),
    headers: buildReadingApiHeaders({ readingApiKey: api.apiKey }),
    body: JSON.stringify(buildReadingApiRequest(joined, userReadings))
  });
  if (!response.ok) {
    throw new Error(`reading API: HTTP ${response.status}`);
  }
  const tokens = (await response.json())?.tokens || [];
  const results = new Map();
  let offset = 0;
  for (const line of lines) {
    const end = offset + line.length;
    // 全文に対する位置を行内の位置へ直す
    const own = tokens
      .filter((t) => Array.isArray(t?.span) && t.span[0] >= offset && t.span[1] <= end)
      .map((t) => ({ ...t, span: [t.span[0] - offset, t.span[1] - offset] }));
    let html = null;
    try {
      html = parseReadingApiResponse({ tokens: own }, line, userReadings);
    } catch {
      // 読みが無い行・位置が合わない行は手元のエンジンに任せる
    }
    results.set(line, html);
    offset = end + 1;
  }
  return results;
}

/**
 * 1 回の文字数が上限を超えないよう行を分ける。
 * @param {string[]} lines
 * @returns {string[][]}
 */
export function chunkLines(lines, maxChars = BATCH_MAX_CHARS) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    if (current.length && size + line.length + 1 > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
