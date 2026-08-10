/**
 * デモ用: Unihan 単漢字フォールバック（拡張の src/kanji-readings.js と同趣旨）。
 * 複合が欠けても漢字に読みを残す。読み無し放置が最悪。
 */

/** @type {Record<string, { default: string, readings: string[] }>} */
let kanjiReadings = {};

const KANJI_ONLY_RE = /^[\u3400-\u9fff\uF900-\uFAFF々〻]+$/;

/**
 * @param {Record<string, { default: string, readings: string[] } | string>} dict
 */
export function installKanjiReadings(dict) {
  kanjiReadings = {};
  for (const [ch, val] of Object.entries(dict || {})) {
    if (typeof val === "string") {
      const r = String(val || "").trim();
      if (r) kanjiReadings[ch] = { default: r, readings: [r] };
    } else if (val && typeof val === "object") {
      const readings = (val.readings || []).map((x) => String(x || "").trim()).filter(Boolean);
      const def = String(val.default || "").trim() || readings[0] || "";
      if (def) {
        kanjiReadings[ch] = {
          default: def,
          readings: readings.length ? readings : [def],
        };
      }
    }
  }
  return kanjiReadings;
}

export function getKanjiReadingCount() {
  return Object.keys(kanjiReadings).length;
}

function lookupDefault(surface) {
  const ch = String(surface || "");
  if (ch.length !== 1) return "";
  return kanjiReadings[ch]?.default || "";
}

/**
 * @param {string} surface
 */
export function lookupKanjiSurfaceReading(surface) {
  const s = String(surface || "");
  if (!s || !KANJI_ONLY_RE.test(s)) return "";
  if (s.length === 1) return lookupDefault(s);
  let out = "";
  for (const ch of s) {
    const r = lookupDefault(ch);
    if (!r) return "";
    out += r;
  }
  return out;
}

function hasUsefulKanaReading(token) {
  const raw = token?.reading || token?.pronunciation || "";
  const reading = String(raw || "").trim();
  if (!reading) return false;
  return /[\u3040-\u309f]/.test(reading);
}

/**
 * @param {object[]} tokens
 */
export function applyKanjiReadings(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return tokens || [];
  if (!Object.keys(kanjiReadings).length) return tokens;

  return tokens.map((token) => {
    const surface = token?.surface || token?.surface_form || "";
    if (hasUsefulKanaReading(token)) return token;
    const reading = lookupKanjiSurfaceReading(surface);
    if (!reading) return token;
    return {
      ...token,
      reading,
      pronunciation: reading,
      source: token.source === "unset" ? "kanji" : token.source,
      _kanjiReading: true,
    };
  });
}
