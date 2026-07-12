import { buildRuby, wrapFuriganaWord } from "./furigana.js";
import { normalizeReading } from "./reading-normalize.js";
import { mergeTokensForRuby } from "./token-merge.js";
import {
  applyManualPhraseReadings,
  MANUAL_PHRASE_READINGS
} from "./reading-context.js";

/**
 * JRM 互換の読み推定 API（BYO）。
 * 既定エンジンは Kuromoji。ここはユーザーが URL を指定したときだけ使う。
 *
 * 公開 JRM は全文トークンではなく、読み付き箇所だけを span 付きで返す。
 */

export function normalizeReadingApiUrl(url) {
  const trimmed = String(url ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/v1\/readings$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1/readings`;
}

export function readingApiOriginPattern(url) {
  const normalized = normalizeReadingApiUrl(url);
  if (!normalized) return null;
  try {
    return `${new URL(normalized).origin}/*`;
  } catch {
    return null;
  }
}

export function userDictToApiEntries(dict) {
  return Object.entries(dict || {})
    .filter(([surface, reading]) => surface && reading)
    .map(([surface, reading]) => ({
      surface,
      reading: normalizeReading(reading)
    }));
}

export function buildReadingApiRequest(text, userDict = {}) {
  return {
    text: String(text ?? ""),
    user_dict: userDictToApiEntries(userDict),
    return_candidates: true
  };
}

/**
 * @param {{ readingApiKey?: string, licenseKey?: string }} [settings]
 */
export function buildReadingApiHeaders(settings = {}) {
  const headers = { "Content-Type": "application/json" };
  const key = String(settings.readingApiKey || settings.licenseKey || "").trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function collapseWhitespace(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function tokenSpan(token, originalText) {
  const surface = String(token?.surface ?? "");
  if (
    Array.isArray(token?.span) &&
    token.span.length === 2 &&
    Number.isInteger(token.span[0]) &&
    Number.isInteger(token.span[1]) &&
    token.span[0] >= 0 &&
    token.span[1] > token.span[0] &&
    token.span[1] <= originalText.length
  ) {
    return { start: token.span[0], end: token.span[1], surface };
  }
  return null;
}

/**
 * span 付き部分トークン、または全文カバーのトークン列のどちらでも通す。
 */
export function validateReadingApiTokens(original, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  const text = String(original ?? "");
  if (!text) return false;

  const joined = tokens.map((token) => String(token?.surface ?? "")).join("");
  if (
    joined &&
    (joined.normalize("NFKC") === text.normalize("NFKC") ||
      collapseWhitespace(joined) === collapseWhitespace(text))
  ) {
    return true;
  }

  let covered = false;
  for (const token of tokens) {
    const span = tokenSpan(token, text);
    if (!span) return false;
    if (text.slice(span.start, span.end) !== span.surface) return false;
    covered = true;
  }
  return covered;
}

/**
 * @param {Array<{ surface?: string, reading?: string, pos?: string }>} tokens
 */
export function readingApiTokensToHtml(tokens) {
  const normalizedTokens = (tokens || []).map((token) => ({
    surface_form: String(token?.surface ?? ""),
    reading: normalizeReading(token?.reading || ""),
    pronunciation: normalizeReading(token?.reading || ""),
    pos: token?.pos || ""
  }));
  const merged = applyManualPhraseReadings(
    mergeTokensForRuby(normalizedTokens, {
      extraSurfaces: MANUAL_PHRASE_READINGS.keys()
    })
  );

  return merged
    .map((token) => {
      const surface = token.surface_form || "";
      if (!surface) return "";
      const reading = normalizeReading(token.reading || "");
      const ruby = buildRuby(surface, reading);
      if (!reading || ruby === surface) return ruby;
      return wrapFuriganaWord(surface, reading, ruby);
    })
    .join("");
}

function renderSurface(surface, reading) {
  const normalized = normalizeReading(reading || "");
  const ruby = buildRuby(surface, normalized);
  if (!normalized || ruby === surface) return surface;
  return wrapFuriganaWord(surface, normalized, ruby);
}

/**
 * JRM の span 応答を原文に合成してルビ HTML にする。
 */
export function readingApiSpansToHtml(originalText, tokens) {
  const text = String(originalText ?? "");
  const spans = (tokens || [])
    .map((token) => {
      const span = tokenSpan(token, text);
      if (!span) return null;
      return {
        ...span,
        reading: normalizeReading(token?.reading || "")
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  let html = "";
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      html += text.slice(cursor, span.start);
    }
    html += renderSurface(text.slice(span.start, span.end), span.reading);
    cursor = span.end;
  }
  if (cursor < text.length) {
    html += text.slice(cursor);
  }
  return html;
}

export function parseReadingApiResponse(payload, originalText) {
  const tokens = payload?.tokens;
  if (!validateReadingApiTokens(originalText, tokens)) {
    throw new Error("Reading API response failed surface validation");
  }

  const joined = tokens.map((token) => String(token?.surface ?? "")).join("");
  const text = String(originalText ?? "");
  const coversAll =
    joined.normalize("NFKC") === text.normalize("NFKC") ||
    collapseWhitespace(joined) === collapseWhitespace(text);

  if (coversAll) {
    return readingApiTokensToHtml(tokens);
  }
  return readingApiSpansToHtml(text, tokens);
}
