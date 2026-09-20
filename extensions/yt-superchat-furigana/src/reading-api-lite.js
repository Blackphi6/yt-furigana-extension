/**
 * Live Chat 用の薄い読み API クライアント（重い neologd / context を載せない）
 */
import {
  buildRuby,
  wrapFuriganaWord,
  hasKanji,
  isRegisterableSurface,
  isLatinWord,
  isUsefulLatinReading
} from "../../../src/furigana.js";
import { stripAnnotationMarkers } from "../../../src/annotation-markers.js";
import {
  normalizeReading,
  normalizeUserReading,
  toKatakana
} from "../../../src/reading-normalize.js";

/**
 * @param {string} url
 */
export function normalizeReadingApiUrl(url) {
  const trimmed = String(url ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/v1\/readings$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1/readings`;
}

/**
 * @param {string} text
 * @param {Record<string, string>} [userDict]
 */
export function buildReadingApiRequest(text, userDict = {}) {
  return {
    text: prepareReadingApiText(text),
    user_dict: Object.entries(userDict || {})
      .filter(([surface, reading]) => surface && reading)
      .map(([surface, reading]) => ({
        surface,
        reading: normalizeReading(reading)
      })),
    return_candidates: false
  };
}

export function buildReadingApiHeaders() {
  return { "Content-Type": "application/json" };
}

function collapseWhitespace(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function prepareReadingApiText(text) {
  return stripAnnotationMarkers(
    String(text ?? "").replace(/[\u200b\u200c\u200d\ufeff]/g, "")
  );
}

/**
 * @param {string} surface
 * @param {string} reading
 */
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
 * @param {unknown} payload
 * @param {string} originalText
 */
export function parseReadingApiResponseLite(payload, originalText) {
  const text = prepareReadingApiText(originalText);
  const tokens = /** @type {Array<{ surface?: string, reading?: string, span?: number[] }> | undefined} */ (
    /** @type {{ tokens?: unknown }} */ (payload)?.tokens
  );
  if (!Array.isArray(tokens)) {
    throw new Error("Reading API response failed surface validation");
  }
  if (!tokens.length) {
    if (!text || !hasKanji(text)) return text;
    throw new Error("Reading API response failed surface validation");
  }
  const joined = tokens.map((t) => String(t?.surface ?? "")).join("");
  const coversAll =
    joined.normalize("NFKC") === text.normalize("NFKC") ||
    collapseWhitespace(joined) === collapseWhitespace(text);

  if (coversAll) {
    return tokens
      .map((t) => renderSurface(String(t.surface || ""), String(t.reading || "")))
      .join("");
  }

  // span 合成
  const spans = tokens
    .map((t) => {
      if (!Array.isArray(t.span) || t.span.length !== 2) return null;
      const start = t.span[0];
      const end = t.span[1];
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > text.length
      ) {
        return null;
      }
      return {
        start,
        end,
        reading: String(t.reading || "")
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  let html = "";
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) html += text.slice(cursor, span.start);
    html += renderSurface(text.slice(span.start, span.end), span.reading);
    cursor = span.end;
  }
  if (cursor < text.length) html += text.slice(cursor);
  return html;
}
