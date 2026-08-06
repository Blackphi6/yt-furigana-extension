/**
 * 旧字体・人名異体字を辞書照合用の常用形へ寄せる。
 * 画面上の表層は原文のままにし、トークン化・フレーズ検索のキーだけ変換する。
 *
 * マップ: joyokanji（Apache-2.0）由来 + data/kanji-compat-extra.json
 */
import kanjiCompatMap from "../data/generated/kanji-compat-map.json" with {
  type: "json"
};

/** @type {Record<string, string>} */
const CHAR_MAP = Object.fromEntries(
  Object.entries(kanjiCompatMap || {}).filter(
    ([from, to]) =>
      !from.startsWith("_") &&
      typeof to === "string" &&
      [...from].length === 1 &&
      [...to].length === 1
  )
);

/** 異体字セレクタ（CJK 含む）は照合・表示とも除去（不可視） */
const VS_RE = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;

/**
 * @param {string} text
 */
export function stripVariationSelectors(text) {
  return String(text ?? "").replace(VS_RE, "");
}

/**
 * 1文字を照合用に正規化（マップ外はそのまま）
 * @param {string} char
 */
export function normalizeKanjiChar(char) {
  return CHAR_MAP[char] || char;
}

/**
 * 文字列全体を照合キーへ（コードポイント単位・長さは維持）
 * @param {string} text
 */
export function normalizeKanjiForLookup(text) {
  const stripped = stripVariationSelectors(text);
  if (!stripped) return "";
  let changed = false;
  const out = [];
  for (const ch of stripped) {
    const next = CHAR_MAP[ch] || ch;
    if (next !== ch) changed = true;
    out.push(next);
  }
  return changed ? out.join("") : stripped;
}

/**
 * 照合用テキスト上のトークン表層を、原文の対応スライスへ戻す。
 * normalizeKanjiForLookup が 1:1 のため、コードポイント長は一致する前提。
 *
 * @param {Array<{ surface_form?: string }>} tokens
 * @param {string} originalText 表示用（VS 除去済み）
 * @param {string} lookupText normalizeKanjiForLookup(originalText)
 */
export function remapTokenSurfacesToOriginal(tokens, originalText, lookupText) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];
  const originalChars = [...String(originalText ?? "")];
  const lookupChars = [...String(lookupText ?? "")];
  if (originalChars.length !== lookupChars.length) {
    // 長さ不一致時は表層を触らない（安全側）
    return tokens;
  }

  let cursor = 0;
  return tokens.map((token) => {
    const surface = String(token?.surface_form ?? "");
    const len = [...surface].length;
    if (len <= 0) return token;
    const slice = originalChars.slice(cursor, cursor + len).join("");
    cursor += len;
    if (!slice || slice === surface) return token;
    return { ...token, surface_form: slice };
  });
}

export function getKanjiCompatMapSize() {
  return Object.keys(CHAR_MAP).length;
}

/** テスト用にマップを差し替える */
export function installKanjiCompatMapForTests(map) {
  for (const key of Object.keys(CHAR_MAP)) delete CHAR_MAP[key];
  Object.assign(CHAR_MAP, map || {});
}
