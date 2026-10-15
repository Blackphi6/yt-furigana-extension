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

/**
 * @param {true | { url?: string, apiKey?: string, timeoutMs?: number } | undefined} option
 * @returns {{ endpoint: string, apiKey: string, timeoutMs: number } | null}
 */
export function resolveReadingApiOption(option) {
  if (!option) return null;
  const config = option === true ? {} : option;
  const timeoutMs = Number(config.timeoutMs);
  return {
    endpoint: normalizeReadingApiUrl(config.url || PUBLIC_READING_API_URL),
    apiKey: String(config.apiKey || ""),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

/**
 * 読み API でルビ HTML を作る（語ごとの span 付き）。失敗時は例外。
 * @param {string} text
 * @param {{ endpoint: string, apiKey: string, timeoutMs: number }} api
 * @param {Record<string, string>} userReadings
 */
export async function fetchReadingApiHtml(text, api, userReadings) {
  const response = await fetch(api.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(api.timeoutMs),
    headers: buildReadingApiHeaders({ readingApiKey: api.apiKey }),
    body: JSON.stringify(buildReadingApiRequest(text, userReadings))
  });
  if (!response.ok) {
    throw new Error(`reading API: HTTP ${response.status}`);
  }
  return parseReadingApiResponse(await response.json(), text, userReadings);
}
