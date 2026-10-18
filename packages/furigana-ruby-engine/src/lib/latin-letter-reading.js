/**
 * 欧文略語のアルファベット逐語読み（C→シー, T→ティー…）。
 * 形態素が CTP→シーティーピー を返すと漢字ルビに混ざるため、検出・剥がしに使う。
 */

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

/** 長い候補を先に試す（ティー vs テー、ダブリュー vs ダブリュ） */
const LATIN_LETTER_READINGS = {
  A: ["エー", "エイ"],
  B: ["ビー"],
  C: ["シー"],
  D: ["ディー", "デー"],
  E: ["イー"],
  F: ["エフ"],
  G: ["ジー"],
  H: ["エイチ", "エッチ"],
  I: ["アイ"],
  J: ["ジェー", "ジェイ"],
  K: ["ケー", "ケイ"],
  L: ["エル"],
  M: ["エム"],
  N: ["エヌ"],
  O: ["オー", "オウ"],
  P: ["ピー"],
  Q: ["キュー"],
  R: ["アール"],
  S: ["エス"],
  T: ["ティー", "テー"],
  U: ["ユー"],
  V: ["ブイ", "ヴィー"],
  W: ["ダブリュー", "ダブルユー", "ダブリュ"],
  X: ["エックス"],
  Y: ["ワイ"],
  Z: ["ゼット", "ジー"]
};

function letterVariants(char) {
  const key = String(char || "").toUpperCase();
  const raw = LATIN_LETTER_READINGS[key];
  if (!raw) return [];
  return raw.map((kana) => toHiragana(kana));
}

/**
 * 読み先頭が表層のラテン逐語と一致するなら、残りの読みを返す。
 * 一致しない文字があれば元の読みを返す（漢字読みを壊さない）。
 * @param {string} latinRun CTP / CTP  など（非ラテンは読みを消費しない）
 * @param {string} reading
 */
export function stripLeadingAlphabetReading(latinRun, reading) {
  const original = String(reading || "");
  let rest = toHiragana(original);
  const startLen = rest.length;

  for (const char of String(latinRun || "")) {
    if (!/[A-Za-z]/.test(char)) continue;
    const variants = letterVariants(char);
    let matched = null;
    for (const v of variants) {
      if (v && rest.startsWith(v)) {
        matched = v;
        break;
      }
    }
    if (!matched) return original;
    rest = rest.slice(matched.length);
  }

  if (rest.length === startLen) return original;
  // かな文字数はひらがな化前後で一致する想定
  return original.slice(startLen - rest.length);
}

/** @param {string} latinRun @param {string} reading */
export function stripTrailingAlphabetReading(latinRun, reading) {
  const original = String(reading || "");
  let rest = toHiragana(original);
  const startLen = rest.length;
  const letters = [...String(latinRun || "")].filter((c) => /[A-Za-z]/.test(c));

  for (let i = letters.length - 1; i >= 0; i -= 1) {
    const variants = letterVariants(letters[i]);
    let matched = null;
    for (const v of variants) {
      if (v && rest.endsWith(v)) {
        matched = v;
        break;
      }
    }
    if (!matched) return original;
    rest = rest.slice(0, rest.length - matched.length);
  }

  if (rest.length === startLen) return original;
  return original.slice(0, rest.length);
}

/**
 * 表層がラテン語で、読みがアルファベット逐語そのものか。
 * CTP→シーティーピー は true、You→ユー / Only→オンリー は false。
 */
export function isAlphabetLetterSpelling(surface, reading) {
  const s = String(surface || "");
  if (!/^[A-Za-z]+$/.test(s)) return false;
  const hira = toHiragana(reading || "");
  if (!hira) return false;
  return stripLeadingAlphabetReading(s, hira) === "";
}

/**
 * 漢字＋欧文の表層で、欧文逐語分を読みから剥がす（data-reading 用）。
 * 例: CTP 本社 + しーてぃーぴーほんしゃ → ほんしゃ
 */
export function stripMixedSurfaceAlphabetReading(surface, reading) {
  let rest = String(reading || "");
  if (!rest || !/[A-Za-z]/.test(String(surface || ""))) return rest;
  const lead = String(surface).match(/^[A-Za-z][A-Za-z0-9'’.\-\s]*/);
  if (lead) rest = stripLeadingAlphabetReading(lead[0], rest);
  const trail = String(surface).match(/[A-Za-z][A-Za-z0-9'’.\-\s]*$/);
  if (trail && trail.index > 0) {
    rest = stripTrailingAlphabetReading(trail[0], rest);
  }
  return rest;
}
