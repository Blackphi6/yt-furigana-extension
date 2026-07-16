/**
 * CMUdict (ARPAbet) → カタカナ転写（規則ベース）。
 * ライセンス: 規則コードは本リポジトリ（MIT）。音素辞書は CMUdict (BSD-2-Clause)。
 *
 * 外来語の慣例に寄せた近似。完璧な和製英語一致は狙わず、字幕で読めることを優先。
 */

const VOWELS = new Set([
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "EH",
  "ER",
  "EY",
  "IH",
  "IY",
  "OW",
  "OY",
  "UH",
  "UW"
]);

/** 単独母音 → カタカナ */
const VOWEL_KANA = {
  AA: "ア",
  AE: "ア",
  AH: "ア",
  AO: "オ",
  AW: "アウ",
  AY: "アイ",
  EH: "エ",
  ER: "アー",
  EY: "エイ",
  IH: "イ",
  IY: "イ",
  OW: "オウ",
  OY: "オイ",
  UH: "ウ",
  UW: "ウー"
};

/**
 * 子音 + 母音核 → カタカナ行。母音は AA/AH/AE→ア, EH→エ, IH/IY→イ, AO/OW/UH/UW→オ/ウ 系に丸める。
 * @type {Record<string, Record<string, string>>}
 */
const CV = {
  B: { a: "バ", i: "ビ", u: "ブ", e: "ベ", o: "ボ" },
  CH: { a: "チャ", i: "チ", u: "チュ", e: "チェ", o: "チョ" },
  D: { a: "ダ", i: "ディ", u: "ドゥ", e: "デ", o: "ド" },
  DH: { a: "ザ", i: "ジ", u: "ズ", e: "ゼ", o: "ゾ" },
  F: { a: "ファ", i: "フィ", u: "フ", e: "フェ", o: "フォ" },
  G: { a: "ガ", i: "ギ", u: "グ", e: "ゲ", o: "ゴ" },
  HH: { a: "ハ", i: "ヒ", u: "フ", e: "ヘ", o: "ホ" },
  JH: { a: "ジャ", i: "ジ", u: "ジュ", e: "ジェ", o: "ジョ" },
  K: { a: "カ", i: "キ", u: "ク", e: "ケ", o: "コ" },
  L: { a: "ラ", i: "リ", u: "ル", e: "レ", o: "ロ" },
  M: { a: "マ", i: "ミ", u: "ム", e: "メ", o: "モ" },
  N: { a: "ナ", i: "ニ", u: "ヌ", e: "ネ", o: "ノ" },
  NG: { a: "ンガ", i: "ンギ", u: "ング", e: "ンゲ", o: "ンゴ" },
  P: { a: "パ", i: "ピ", u: "プ", e: "ペ", o: "ポ" },
  R: { a: "ラ", i: "リ", u: "ル", e: "レ", o: "ロ" },
  S: { a: "サ", i: "シ", u: "ス", e: "セ", o: "ソ" },
  SH: { a: "シャ", i: "シ", u: "シュ", e: "シェ", o: "ショ" },
  T: { a: "タ", i: "ティ", u: "トゥ", e: "テ", o: "ト" },
  TH: { a: "サ", i: "シ", u: "ス", e: "セ", o: "ソ" },
  V: { a: "ヴァ", i: "ヴィ", u: "ヴ", e: "ヴェ", o: "ヴォ" },
  W: { a: "ワ", i: "ウィ", u: "ウ", e: "ウェ", o: "ウォ" },
  Y: { a: "ヤ", i: "イ", u: "ユ", e: "イェ", o: "ヨ" },
  Z: { a: "ザ", i: "ジ", u: "ズ", e: "ゼ", o: "ゾ" },
  ZH: { a: "ジャ", i: "ジ", u: "ジュ", e: "ジェ", o: "ジョ" }
};

/** 語末・子音連続の閉鎖音など */
const CODA = {
  B: "ブ",
  CH: "チ",
  D: "ド",
  DH: "ズ",
  F: "フ",
  G: "グ",
  HH: "ッ",
  JH: "ジ",
  K: "ク",
  L: "ル",
  M: "ム",
  N: "ン",
  NG: "ング",
  P: "プ",
  R: "ル",
  S: "ス",
  SH: "シュ",
  T: "ト",
  TH: "ス",
  V: "ブ",
  W: "ウ",
  Y: "イ",
  Z: "ズ",
  ZH: "ジュ"
};

/**
 * @param {string} phone
 * @returns {{ base: string, stress: number }}
 */
export function normalizePhone(phone) {
  const raw = String(phone || "").toUpperCase().trim();
  const m = raw.match(/^([A-Z]+)([0-2])?$/);
  if (!m) return { base: raw.replace(/[0-2]/g, ""), stress: 0 };
  return { base: m[1], stress: m[2] ? Number(m[2]) : 0 };
}

/**
 * @param {string} vowelBase
 * @returns {"a"|"i"|"u"|"e"|"o"}
 */
function vowelClass(vowelBase) {
  switch (vowelBase) {
    case "IY":
    case "IH":
      return "i";
    case "UW":
    case "UH":
      return "u";
    case "EH":
    case "EY":
      return "e";
    case "AO":
    case "OW":
    case "OY":
      return "o";
    case "AA":
    case "AE":
    case "AH":
    case "AW":
    case "AY":
    case "ER":
    default:
      return "a";
  }
}

/**
 * 二重母音などは CV の後に残りを足す。
 * @param {string} consonant
 * @param {string} vowelBase
 */
function combineCV(consonant, vowelBase) {
  const row = CV[consonant];
  if (!row) return VOWEL_KANA[vowelBase] || "";

  // yeah / yellow 系
  if (consonant === "Y" && vowelBase === "AE") return "イェア";
  if (consonant === "Y" && vowelBase === "EH") return "イェ";

  if (vowelBase === "AW") return `${row.a}ウ`;
  if (vowelBase === "AY") return `${row.a}イ`;
  if (vowelBase === "EY") return `${row.e}イ`;
  if (vowelBase === "OW") return `${row.o}ウ`;
  if (vowelBase === "OY") return `${row.o}イ`;
  if (vowelBase === "ER") return `${row.a}ー`;
  if (vowelBase === "IY") return row.i; // ハピネス（長音にしすぎない）
  if (vowelBase === "UW") return `${row.u}ー`;

  const cls = vowelClass(vowelBase);
  return row[cls] || row.u || "";
}

/**
 * @param {string[]|string} phones ARPAbet 列（スペース区切り可）
 * @returns {string} カタカナ
 */
export function arpabetToKatakana(phones) {
  const list = Array.isArray(phones)
    ? phones
    : String(phones || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

  const bases = list.map((p) => normalizePhone(p).base).filter(Boolean);
  let out = "";
  let i = 0;

  while (i < bases.length) {
    const cur = bases[i];
    const next = bases[i + 1];
    const next2 = bases[i + 2];

    if (VOWELS.has(cur)) {
      out += VOWEL_KANA[cur] || "ア";
      i += 1;
      continue;
    }

    // habit / rabbit / limit / credit:
    // 子音 + 弱母音 AH + 語末閉鎖音 → イ段 + 促音（ハビット）
    if (
      next === "AH" &&
      next2 &&
      (next2 === "T" || next2 === "P" || next2 === "K") &&
      (i + 3 >= bases.length || VOWELS.has(bases[i + 3]) === false)
    ) {
      const stop = next2;
      const isWordFinalStop = i + 3 >= bases.length;
      const isBeforeConsonant =
        i + 3 < bases.length && !VOWELS.has(bases[i + 3]);
      if (isWordFinalStop || isBeforeConsonant) {
        if (cur === "D" && stop === "T") {
          out += "ジット";
        } else {
          const stopKana = { T: "ト", P: "プ", K: "ク" }[stop];
          out += `${combineCV(cur, "IH")}ッ${stopKana}`;
        }
        i += 3;
        continue;
      }
    }

    if (next && VOWELS.has(next)) {
      out += combineCV(cur, next);
      i += 2;
      continue;
    }

    // 子音連続 / 語末（onset cluster は ク+レ のように母音挿入）
    if (cur === "N" || cur === "NG") {
      out += CODA[cur] || "ン";
    } else {
      out += CODA[cur] || "";
    }
    i += 1;
  }

  // 長音の重複を軽く整理
  out = out.replace(/ー{2,}/g, "ー").replace(/ッッ+/g, "ッ");
  // よくある接尾の慣用寄せ
  out = out.replace(/ナス$/, "ネス"); // -ness
  out = out.replace(/シャン$/, "ション"); // -tion / -sion 近似
  out = out.replace(/ハロウ$/, "ハロー");
  return out;
}

/**
 * @param {string} word
 * @param {Record<string, string[]>} cmudict word(lower) → phones[]
 * @returns {string}
 */
export function englishWordToKatakana(word, cmudict) {
  const key = String(word || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/’/g, "'");
  if (!key || !cmudict) return "";
  const phones = cmudict[key];
  if (!phones || phones.length === 0) return "";
  return arpabetToKatakana(phones);
}
