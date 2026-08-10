/**
 * Unihan 由来の単漢字読み（フォールバック + 候補）。
 * 辞書: dict/kanji-readings.json.gz
 */

import { normalizeReading } from "./reading-normalize.js";

/** @type {Record<string, { default: string, readings: string[] }>} */
let kanjiReadings = {};
let loadPromise = null;

export function getKanjiReadingCount() {
  return Object.keys(kanjiReadings).length;
}

/**
 * @param {Record<string, { default: string, readings: string[] } | string>} dict
 */
export function installKanjiReadingsForTests(dict) {
  kanjiReadings = {};
  for (const [ch, val] of Object.entries(dict || {})) {
    if (typeof val === "string") {
      const r = normalizeReading(val);
      if (r) kanjiReadings[ch] = { default: r, readings: [r] };
    } else if (val && typeof val === "object") {
      const readings = (val.readings || [])
        .map((x) => normalizeReading(x))
        .filter(Boolean);
      const def = normalizeReading(val.default) || readings[0] || "";
      if (def) {
        kanjiReadings[ch] = {
          default: def,
          readings: readings.length ? readings : [def]
        };
      }
    }
  }
  return kanjiReadings;
}

/**
 * @param {string} [url]
 */
export async function loadKanjiReadings(url) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const dictUrl =
      url ||
      (typeof chrome !== "undefined" && chrome?.runtime?.getURL
        ? chrome.runtime.getURL("dict/kanji-readings.json.gz")
        : "");
    if (!dictUrl) throw new Error("kanji-readings URL missing");

    const response = await fetch(dictUrl);
    if (!response.ok) {
      throw new Error(`kanji-readings fetch failed: ${response.status}`);
    }
    if (typeof DecompressionStream !== "function") {
      throw new Error("DecompressionStream is not available");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const jsonText = await new Response(stream).text();
    const parsed = JSON.parse(jsonText);
    installKanjiReadingsForTests(parsed && typeof parsed === "object" ? parsed : {});
    return kanjiReadings;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    kanjiReadings = {};
    throw error;
  }
}

/**
 * @param {string} surface
 * @returns {string}
 */
export function lookupKanjiDefaultReading(surface) {
  const ch = String(surface || "");
  if (ch.length !== 1) return "";
  return kanjiReadings[ch]?.default || "";
}

/**
 * @param {string} surface
 * @returns {string[]}
 */
export function lookupKanjiReadingCandidates(surface) {
  const ch = String(surface || "");
  if (ch.length !== 1) return [];
  return kanjiReadings[ch]?.readings || [];
}

function hasUsefulKanaReading(token) {
  const raw = token?.reading || token?.pronunciation || "";
  const reading = normalizeReading(raw);
  if (!reading) return false;
  return /[\u3040-\u309f]/.test(reading);
}

const KANJI_ONLY_RE = /^[\u3400-\u9fff\uF900-\uFAFF々〻]+$/;

/**
 * 漢字だけの表層から Unihan 既定読みを連結する。
 * 複合が取れなくても「落→らく」相当を残す（読み無し放置が最悪）。
 * @param {string} surface
 */
export function lookupKanjiSurfaceReading(surface) {
  const s = String(surface || "");
  if (!s || !KANJI_ONLY_RE.test(s)) return "";
  if (s.length === 1) return lookupKanjiDefaultReading(s);
  let out = "";
  for (const ch of s) {
    const r = lookupKanjiDefaultReading(ch);
    if (!r) return "";
    out += r;
  }
  return out;
}

/**
 * 読みが無い漢字トークンに Unihan 既定読みを載せる。
 * 複合語・文脈ルールより後に掛けると上書きしてしまうので、
 * merge / english の直後・contextual の前に置く。
 * ギャップ埋めのあとにもう一度掛け、切れ端の単漢字を残さない。
 * @param {Array<object>} tokens
 */
export function applyKanjiReadings(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return tokens || [];
  if (!Object.keys(kanjiReadings).length) return tokens;

  return tokens.map((token) => {
    const surface = token?.surface_form || token?.surface || "";
    if (hasUsefulKanaReading(token)) return token;
    if (token._numberUnit) return token;
    const reading = lookupKanjiSurfaceReading(surface);
    if (!reading) return token;
    return {
      ...token,
      reading,
      pronunciation: reading,
      _kanjiReading: true
    };
  });
}
