import {
  buildRuby,
  wrapFuriganaWord,
  hasKanji,
  isRegisterableSurface,
  isLatinWord,
  isUsefulLatinReading
} from "./furigana.js";
import { normalizeReading, normalizeUserReading, toKatakana } from "./reading-normalize.js";
import { mergeTokensForRuby } from "./token-merge.js";
import {
  applyManualPhraseReadings,
  MANUAL_PHRASE_READINGS
} from "./reading-context.js";
import { getNeologdPhraseTrie } from "./neologd-phrases.js";
import { mergeSpansWithLocalPhrases } from "./phrase-hits.js";
import { applyEnglishKatakanaReadings } from "./english-katakana-reading.js";

/**
 * ユーザー指定の読み推定 API（BYO）。`POST /v1/readings` 形式。
 * 既定エンジンは Kuromoji。ここはユーザーが URL を指定したときだけ使う。
 *
 * 一部の読み API は全文トークンではなく、読み付き箇所だけを span 付きで返す。
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
    // 辞書系（学習・NEologd ヒット）を user_dict 最優先枠へ。API は文脈依存読み、辞書は固有名詞。
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
  // API のカタカナは形態素読み。ひらがな化してから、手動句でユーザーカタカナを上書き。
  const normalizedTokens = (tokens || []).map((token) => {
    const reading = normalizeReading(String(token?.reading || ""));
    return {
      surface_form: String(token?.surface ?? ""),
      reading,
      pronunciation: reading,
      pos: token?.pos || ""
    };
  });
  const merged = applyManualPhraseReadings(
    applyEnglishKatakanaReadings(
      mergeTokensForRuby(normalizedTokens, {
        extraSurfaces: MANUAL_PHRASE_READINGS.keys(),
        phraseTrie: getNeologdPhraseTrie()
      })
    )
  );

  return merged
    .map((token) => {
      const surface = token.surface_form || "";
      if (!surface) return "";
      let preserveKatakana = token.preserveKatakana === true;
      let reading = preserveKatakana
        ? normalizeUserReading(token.reading || "")
        : normalizeReading(token.reading || "");
      if (isLatinWord(surface)) {
        if (!isUsefulLatinReading(reading)) {
          reading = "";
        } else {
          reading = toKatakana(reading);
          preserveKatakana = true;
        }
      }
      const ruby = buildRuby(surface, reading, { preserveKatakana });
      if (!isRegisterableSurface(surface)) return ruby;
      return wrapFuriganaWord(surface, reading, ruby, { preserveKatakana });
    })
    .join("");
}

function renderSurface(surface, reading) {
  let preserveKatakana = /[\u30a1-\u30f6]/.test(reading || "");
  let normalized = preserveKatakana
    ? normalizeUserReading(reading || "")
    : normalizeReading(reading || "");
  if (isLatinWord(surface)) {
    if (!isUsefulLatinReading(normalized)) {
      normalized = "";
    } else {
      normalized = toKatakana(normalized);
      preserveKatakana = true;
    }
  }
  const ruby = buildRuby(surface, normalized, { preserveKatakana });
  if (!isRegisterableSurface(surface)) return surface;
  return wrapFuriganaWord(surface, normalized, ruby, { preserveKatakana });
}

/**
 * 読み API の span 応答を原文に合成してルビ HTML にする。
 * ローカル句（NEologd / 学習）を優先して上書きし、辞書＋API 併用にする。
 * @param {string} originalText
 * @param {Array<object>} tokens
 * @param {Record<string, string>} [userPhrases]
 */
export function readingApiSpansToHtml(originalText, tokens, userPhrases = {}) {
  const text = String(originalText ?? "");
  const apiSpans = (tokens || [])
    .map((token) => {
      const span = tokenSpan(token, text);
      if (!span) return null;
      return {
        ...span,
        reading: normalizeReading(token?.reading || ""),
        source: token?.source || "api"
      };
    })
    .filter(Boolean);

  const spans = mergeSpansWithLocalPhrases(text, apiSpans, userPhrases).sort(
    (a, b) => a.start - b.start || b.end - a.end
  );

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

export function parseReadingApiResponse(payload, originalText, userPhrases = {}) {
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
  return readingApiSpansToHtml(text, tokens, userPhrases);
}
