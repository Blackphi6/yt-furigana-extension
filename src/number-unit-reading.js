/**
 * 数字＋単位の読みを規則で固める。
 * LLM 同形異音ループとは別系統（決定的な数詞問題）。
 *
 * 例: 0時→れいじ / 7,000円→ななせんえん / 1人→ひとり
 */

import { normalizeReading, toKatakana } from "./reading-normalize.js";

const DIGIT = [
  "",
  "いち",
  "に",
  "さん",
  "よん",
  "ご",
  "ろく",
  "なな",
  "はち",
  "きゅう"
];

/**
 * @typedef {{
 *   suffix: string,
 *   special?: Record<number, string>,
 *   zeroReading?: string,
 *   katakana?: boolean,
 *   juuSokuon?: boolean,
 *   ichiSokuon?: boolean
 * }} UnitSpec
 */

/** 欧文単位: 読みはカタカナ（認識しやすさ優先） */
function latinUnit(suffix, extra = {}) {
  return { suffix, katakana: true, ...extra };
}

/** @type {Record<string, UnitSpec>} */
const UNIT_SPECS = {
  "時": {
    suffix: "じ",
    zeroReading: "れい",
    special: {
      0: "れいじ",
      1: "いちじ",
      2: "にじ",
      3: "さんじ",
      4: "よじ",
      5: "ごじ",
      6: "ろくじ",
      7: "しちじ",
      8: "はちじ",
      9: "くじ",
      10: "じゅうじ",
      11: "じゅういちじ",
      12: "じゅうにじ",
      13: "じゅうさんじ",
      14: "じゅうよじ",
      15: "じゅうごじ",
      16: "じゅうろくじ",
      17: "じゅうしちじ",
      18: "じゅうはちじ",
      19: "じゅうくじ",
      20: "にじゅうじ",
      21: "にじゅういちじ",
      22: "にじゅうにじ",
      23: "にじゅうさんじ",
      24: "にじゅうよじ"
    }
  },
  "分": {
    suffix: "ふん",
    special: {
      1: "いっぷん",
      2: "にふん",
      3: "さんぷん",
      4: "よんぷん",
      5: "ごふん",
      6: "ろっぷん",
      7: "ななふん",
      8: "はっぷん",
      9: "きゅうふん",
      10: "じゅっぷん"
    }
  },
  "秒": {
    suffix: "びょう"
  },
  "円": {
    suffix: "えん",
    zeroReading: "ぜろ",
    special: {
      0: "ぜろえん"
    }
  },
  "人": {
    suffix: "にん",
    special: {
      1: "ひとり",
      2: "ふたり",
      3: "さんにん",
      4: "よにん",
      5: "ごにん",
      6: "ろくにん",
      7: "ななにん",
      8: "はちにん",
      9: "きゅうにん",
      10: "じゅうにん"
    }
  },
  "名": {
    suffix: "めい"
  },
  "歳": {
    suffix: "さい"
  },
  "才": {
    suffix: "さい"
  },
  "年": {
    suffix: "ねん"
  },
  "月": {
    suffix: "がつ",
    special: {
      1: "いちがつ",
      2: "にがつ",
      3: "さんがつ",
      4: "しがつ",
      5: "ごがつ",
      6: "ろくがつ",
      7: "しちがつ",
      8: "はちがつ",
      9: "くがつ",
      10: "じゅうがつ",
      11: "じゅういちがつ",
      12: "じゅうにがつ"
    }
  },
  "日": {
    suffix: "にち",
    special: {
      1: "ついたち",
      2: "ふつか",
      3: "みっか",
      4: "よっか",
      5: "いつか",
      6: "むいか",
      7: "なのか",
      8: "ようか",
      9: "ここのか",
      10: "とおか",
      14: "じゅうよっか",
      20: "はつか",
      24: "にじゅうよっか"
    }
  },
  "回": { suffix: "かい" },
  "倍": { suffix: "ばい" },
  "階": { suffix: "かい" },
  "枚": { suffix: "まい" },
  "冊": { suffix: "さつ" },
  "本": { suffix: "ほん" },
  "個": { suffix: "こ" },
  // 点数（日本語単位 → ひらがな）。10・20…は「じゅっ」促音
  "点": {
    suffix: "てん",
    juuSokuon: true,
    ichiSokuon: true,
    special: {
      1: "いってん",
      8: "はってん",
      10: "じゅってん"
    }
  },
  // 欧文単位（字幕で出やすいもの）→ カタカナ読み（略語のアルファベット逐語はしない）
  // ％: 50%＝ゴジュッパーセント（十＋パ行で促音）
  "%": latinUnit("パーセント", { juuSokuon: true, ichiSokuon: true }),
  "\uFF05": latinUnit("パーセント", { juuSokuon: true, ichiSokuon: true }),
  // 長い略語を先に（UNIT_PATTERN は長さ降順で組む）
  kWh: latinUnit("キロワットアワー"),
  KWh: latinUnit("キロワットアワー"),
  kwh: latinUnit("キロワットアワー"),
  mAh: latinUnit("ミリアンペアアワー"),
  mah: latinUnit("ミリアンペアアワー"),
  Ah: latinUnit("アンペアアワー"),
  AH: latinUnit("アンペアアワー"),
  ah: latinUnit("アンペアアワー"),
  Wh: latinUnit("ワットアワー"),
  WH: latinUnit("ワットアワー"),
  wh: latinUnit("ワットアワー"),
  kW: latinUnit("キロワット"),
  KW: latinUnit("キロワット"),
  kw: latinUnit("キロワット"),
  kV: latinUnit("キロボルト"),
  kv: latinUnit("キロボルト"),
  mA: latinUnit("ミリアンペア"),
  ma: latinUnit("ミリアンペア"),
  VA: latinUnit("ボルトアンペア"),
  va: latinUnit("ボルトアンペア"),
  W: latinUnit("ワット"),
  "\uFF37": latinUnit("ワット"),
  w: latinUnit("ワット"),
  V: latinUnit("ボルト"),
  "\uFF36": latinUnit("ボルト"),
  v: latinUnit("ボルト"),
  A: latinUnit("アンペア"),
  a: latinUnit("アンペア"),
  Hz: latinUnit("ヘルツ"),
  hz: latinUnit("ヘルツ"),
  km: latinUnit("キロメートル"),
  KM: latinUnit("キロメートル"),
  cm: latinUnit("センチメートル"),
  mm: latinUnit("ミリメートル"),
  m: latinUnit("メートル"),
  kg: latinUnit("キログラム"),
  g: latinUnit("グラム"),
  GB: latinUnit("ギガバイト"),
  gb: latinUnit("ギガバイト"),
  MB: latinUnit("メガバイト"),
  mb: latinUnit("メガバイト")
};

/** 小数点以下の 1 桁（0 は「れい」が通例） */
const FRAC_DIGIT = [
  "れい",
  "いち",
  "に",
  "さん",
  "よん",
  "ご",
  "ろく",
  "なな",
  "はち",
  "きゅう"
];

const UNIT_PATTERN = Object.keys(UNIT_SPECS)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/** 整数部（カンマ可）＋任意の小数部＋任意空白＋単位 */
const SURFACE_RE = new RegExp(
  `^([0-9０-９][0-9０-９,，]*)(?:[.．]([0-9０-９]+))?\\s*(${UNIT_PATTERN})$`
);

/** 整数／小数のみ */
const NUMBER_ONLY_RE = new RegExp(
  `^([0-9０-９][0-9０-９,，]*)(?:[.．]([0-9０-９]+))?$`
);

/**
 * 数詞（ひらがな）＋単位。欧文単位は全体をカタカナ化。
 * @param {string} reading
 * @param {UnitSpec} spec
 */
function finalizeUnitReading(reading, spec) {
  const raw = String(reading || "").normalize("NFKC").trim();
  if (!raw) return "";
  if (spec.katakana) {
    return toKatakana(raw);
  }
  return normalizeReading(raw);
}

/**
 * 「十」＋カサタハ（パ含む）始まりの助数詞 → じゅう→じゅっ。
 * 例: 50%→ごじゅっパーセント、50点→ごじゅってん。
 * 母音始まり（円→えん）では促音化しない: 210円→にひゃくじゅうえん。
 * 現代語は NHK 等どおり主流の「じゅっ」を採用（伝統形「じっ」も可）。
 * @param {string} cardinal
 * @param {string} suffix
 */
export function applyJuuSokuon(cardinal, suffix) {
  const base = String(cardinal || "");
  if (!/じゅう$/.test(base)) return base;
  const head = String(suffix || "").normalize("NFKC")[0] || "";
  // カ行・サ行・タ行・ハ行・パ行（促音化しやすい字音結合）
  if (
    !/^[かきくけこがぎぐげごさしすせそざじずぜぞたちつてとだぢづでどはひふへほばびぶべぼぱぴぷぺぽカキクケコガギグゲゴサシスセソザジズゼゾタチツテトダヂヅデドハヒフヘホバビブベボパピプペポ]/.test(
      head
    )
  ) {
    return base;
  }
  return `${base.slice(0, -3)}じゅっ`;
}

/**
 * 1＋パ/タ行など → いっ（1%＝いっパーセント、1点＝いってん）
 * @param {string} cardinal
 * @param {boolean} enabled
 */
function applyIchiSokuon(cardinal, enabled) {
  if (!enabled || cardinal !== "いち") return cardinal;
  return "いっ";
}

/**
 * @param {number} number
 * @param {UnitSpec} spec
 */
function joinCardinalAndSuffix(number, spec) {
  let cardinal = readCardinal(number);
  if (!cardinal) return "";
  if (spec.juuSokuon) {
    cardinal = applyJuuSokuon(cardinal, spec.suffix);
  }
  cardinal = applyIchiSokuon(cardinal, Boolean(spec.ichiSokuon));
  return `${cardinal}${spec.suffix}`;
}

function toAsciiDigits(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
    )
    .replace(/[,，]/g, "");
}

function readUnder1000(n) {
  if (n <= 0) return "";
  let out = "";
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;

  if (hundreds === 1) out += "ひゃく";
  else if (hundreds === 3) out += "さんびゃく";
  else if (hundreds === 6) out += "ろっぴゃく";
  else if (hundreds === 8) out += "はっぴゃく";
  else if (hundreds > 0) out += `${DIGIT[hundreds]}ひゃく`;

  if (tens === 1) out += "じゅう";
  else if (tens > 0) out += `${DIGIT[tens]}じゅう`;

  if (ones > 0) out += DIGIT[ones];
  return out;
}

/**
 * 非負整数の基本漢数字読み（いち、にせん、さんまん…）。
 * 0 は呼び出し側の単位方針に委ねるため空文字。
 * @param {number} n
 * @returns {string | null}
 */
export function readCardinal(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999_9999_9999) return null;
  if (n === 0) return "";

  const parts = [];
  const cho = Math.floor(n / 1_0000_0000_0000);
  const oku = Math.floor((n % 1_0000_0000_0000) / 1_0000_0000);
  const man = Math.floor((n % 1_0000_0000) / 1_0000);
  const rest = n % 1_0000;

  if (cho > 0) {
    parts.push(cho === 1 ? "いっちょう" : `${readUnder1000(cho)}ちょう`);
  }
  if (oku > 0) {
    parts.push(oku === 1 ? "いちおく" : `${readUnder1000(oku)}おく`);
  }
  if (man > 0) {
    parts.push(man === 1 ? "いちまん" : `${readUnder1000(man)}まん`);
  }
  if (rest > 0) {
    if (rest < 1000) {
      parts.push(readUnder1000(rest));
    } else {
      const thousands = Math.floor(rest / 1000);
      const under = rest % 1000;
      let chunk = "";
      if (thousands === 1) chunk += "せん";
      else if (thousands === 3) chunk += "さんぜん";
      else if (thousands === 8) chunk += "はっせん";
      else chunk += `${DIGIT[thousands]}せん`;
      chunk += readUnder1000(under);
      parts.push(chunk);
    }
  }

  return parts.join("") || null;
}

/**
 * @param {string} surface
 * @returns {{
 *   integer: number,
 *   fractionDigits: string | null,
 *   unit: string | null,
 *   numberPart: string
 * } | null}
 */
export function parseNumericCore(surface) {
  const raw = String(surface || "").normalize("NFKC").trim();
  if (!raw) return null;

  let integerText = "";
  let fractionDigits = null;
  let unit = null;

  const withUnit = raw.match(SURFACE_RE);
  if (withUnit) {
    integerText = withUnit[1];
    fractionDigits = withUnit[2] || null;
    unit = withUnit[3];
  } else {
    const only = raw.match(NUMBER_ONLY_RE);
    if (!only) return null;
    integerText = only[1];
    fractionDigits = only[2] || null;
  }

  const intDigits = toAsciiDigits(integerText);
  if (!/^\d+$/.test(intDigits)) return null;
  if (fractionDigits != null) {
    const frac = toAsciiDigits(fractionDigits);
    if (!/^\d+$/.test(frac)) return null;
    fractionDigits = frac;
  }

  const integer = Number(intDigits);
  if (!Number.isSafeInteger(integer) || integer < 0) return null;

  const numberPart =
    fractionDigits != null ? `${intDigits}.${fractionDigits}` : intDigits;

  return { integer, fractionDigits, unit, numberPart };
}

/**
 * 整数部は位取り、小数部は一桁ずつ＋「てん」。
 * @param {{ integer: number, fractionDigits: string | null }} num
 */
export function formatNumericReading(num) {
  if (!num) return "";
  const { integer, fractionDigits } = num;

  if (fractionDigits != null) {
    const head =
      integer === 0 ? "れい" : readCardinal(integer) || "";
    if (!head) return "";
    let out = `${head}てん`;
    for (const ch of fractionDigits) {
      out += FRAC_DIGIT[Number(ch)] || "";
    }
    return out;
  }

  if (integer === 0) return "ぜろ";
  return readCardinal(integer) || "";
}

/**
 * @param {string} surface
 * @returns {{ number: number, unit: string, rawDigits: string, fractionDigits: string | null } | null}
 */
export function parseNumberUnitSurface(surface) {
  const core = parseNumericCore(surface);
  if (!core || !core.unit) return null;
  return {
    number: core.integer,
    unit: core.unit,
    rawDigits: core.numberPart,
    fractionDigits: core.fractionDigits
  };
}

/**
 * @param {number} number
 * @param {string} unit
 * @returns {string}
 */
export function readNumberWithUnit(number, unit) {
  const spec = UNIT_SPECS[unit];
  if (!spec || !Number.isInteger(number) || number < 0) return "";

  const finish = (reading) => finalizeUnitReading(reading, spec);

  if (spec.special && number in spec.special) {
    return finish(spec.special[number]);
  }

  if (number === 0) {
    const zero = spec.zeroReading || "ぜろ";
    return finish(`${zero}${spec.suffix}`);
  }

  // 分: 促音・転呼（10分は special）。20分〜は ✕じゅっぷん
  if (unit === "分") {
    if (number % 10 === 0 && number >= 20 && number <= 90) {
      const t = number / 10;
      const head = t === 2 ? "に" : DIGIT[t];
      return finish(`${head}じゅっぷん`);
    }
    const last = number % 10;
    if (last === 1) {
      return finish(`${readCardinal(number - 1)}いっぷん`);
    }
    if (last === 3) {
      return finish(`${readCardinal(number - 3)}さんぷん`);
    }
    if (last === 6) {
      return finish(`${readCardinal(number - 6)}ろっぷん`);
    }
    if (last === 8) {
      return finish(`${readCardinal(number - 8)}はっぷん`);
    }
    const cardinal = readCardinal(number);
    if (!cardinal) return "";
    return finish(`${cardinal}ふん`);
  }

  // 本: 簡易の促音・濁音
  if (unit === "本") {
    const cardinal = readCardinal(number);
    if (!cardinal) return "";
    const last = number % 10;
    if (number === 1) return finish("いっぽん");
    if (number === 3) return finish("さんぼん");
    if (number === 6) return finish("ろっぽん");
    if (number === 8) return finish("はっぽん");
    if (number === 10) return finish("じゅっぽん");
    if (last === 1) {
      return finish(`${readCardinal(number - 1)}いっぽん`);
    }
    if (last === 3) {
      return finish(`${readCardinal(number - 3)}さんぼん`);
    }
    if (last === 6) {
      return finish(`${readCardinal(number - 6)}ろっぽん`);
    }
    if (last === 8) {
      return finish(`${readCardinal(number - 8)}はっぽん`);
    }
    return finish(`${cardinal}ほん`);
  }

  // 階/回: 1階=いっかい など簡易
  if (unit === "階" || unit === "回") {
    if (number === 1) return finish(`いっ${spec.suffix}`);
    if (number === 6) return finish(`ろっ${spec.suffix}`);
    if (number === 8) return finish(`はっ${spec.suffix}`);
    if (number === 10) return finish(`じゅっ${spec.suffix}`);
  }

  if (unit === "個") {
    if (number === 1) return finish("いっこ");
    if (number === 6) return finish("ろっこ");
    if (number === 8) return finish("はっこ");
    if (number === 10) return finish("じゅっこ");
  }

  return finish(joinCardinalAndSuffix(number, spec));
}

/**
 * 数字表層＋単位の読み（小数対応）。
 * @param {string} numberPart
 * @param {string} unit
 */
export function readNumberPartWithUnit(numberPart, unit) {
  const spec = UNIT_SPECS[unit];
  if (!spec) return "";
  const core = parseNumericCore(numberPart);
  if (!core) return "";

  // 小数は特殊表を使わず一般則
  if (core.fractionDigits != null) {
    const numeric = formatNumericReading(core);
    if (!numeric) return "";
    return finalizeUnitReading(`${numeric}${spec.suffix}`, spec);
  }

  return readNumberWithUnit(core.integer, unit);
}

export function unitUsesKatakana(unit) {
  return UNIT_SPECS[unit]?.katakana === true;
}

/**
 * 表層が「数字のみ」（小数・カンマ可）なら返す。
 * @param {string} surface
 * @returns {{ number: number, rawDigits: string, fractionDigits: string | null } | null}
 */
export function parseNumberSurface(surface) {
  const core = parseNumericCore(surface);
  if (!core || core.unit) return null;
  return {
    number: core.integer,
    rawDigits: core.numberPart,
    fractionDigits: core.fractionDigits
  };
}

/**
 * 単位なし数字の読み。1000→せん / 12.8→じゅうにてんはち
 * @param {string} surface
 * @returns {string}
 */
export function readingForNumberSurface(surface) {
  const core = parseNumericCore(surface);
  if (!core || core.unit) return "";
  return formatNumericReading(core);
}

/**
 * 表層が「数字＋単位」なら読みを返す。
 * @param {string} surface
 * @returns {string}
 */
export function readingForNumberUnitSurface(surface) {
  const core = parseNumericCore(surface);
  if (!core || !core.unit) return "";
  return readNumberPartWithUnit(core.numberPart, core.unit);
}

/** 単位単独の読み（Wh→ワットアワー）。欧文単位のみ。和語助数詞は数字必須。 */
export function readingForUnitAlone(unit) {
  const spec = UNIT_SPECS[unit];
  if (!spec?.katakana) return "";
  return finalizeUnitReading(spec.suffix, spec);
}

export function isKnownNumberUnit(unit) {
  return Object.hasOwn(UNIT_SPECS, unit);
}

function isDigitToken(surface) {
  return /^[0-9０-９]+$/.test(surface || "");
}

function isCommaToken(surface) {
  return /^[,，]$/.test(surface || "");
}

function isDotToken(surface) {
  return /^[.．]$/.test(surface || "");
}

function isSpaceToken(surface) {
  return /^\s+$/.test(surface || "");
}

function isNumberFragmentToken(surface) {
  return (
    isDigitToken(surface) ||
    isCommaToken(surface) ||
    isDotToken(surface)
  );
}

function digitCharCount(surface) {
  return toAsciiDigits(surface.replace(/[.．]/g, "")).length;
}

function canExtendNumber(next) {
  return (
    isNumberFragmentToken(next) ||
    isSpaceToken(next) ||
    isKnownNumberUnit(next)
  );
}

/** カウントダウン／バージョン: 3.2.1 → スリーツーワン（小数の 2.1 とは別） */
const EN_DIGIT_KATA = [
  "ゼロ",
  "ワン",
  "ツー",
  "スリー",
  "フォー",
  "ファイブ",
  "シックス",
  "セブン",
  "エイト",
  "ナイン"
];

/**
 * 「3.2.1」「3. 2. 1」のようにドットが2つ以上で、各段が1桁の列。
 * @param {string} surface
 * @returns {string[] | null} 各段の数字文字列
 */
export function parseDotSeparatedDigits(surface) {
  const raw = String(surface || "").normalize("NFKC").trim();
  if (!raw) return null;
  const dots = (raw.match(/[.．]/g) || []).length;
  if (dots < 2) return null;
  if (!/^[\d０-９\s.．]+$/.test(raw)) return null;
  const parts = raw
    .split(/[.．]/)
    .map((p) => toAsciiDigits(p.trim()))
    .filter((p) => p.length > 0);
  if (parts.length < 3) return null;
  if (!parts.every((p) => /^\d$/.test(p))) return null;
  return parts;
}

/**
 * @param {string[] | string} partsOrSurface
 * @returns {string}
 */
export function readingForDotSeparatedDigits(partsOrSurface) {
  const parts = Array.isArray(partsOrSurface)
    ? partsOrSurface
    : parseDotSeparatedDigits(partsOrSurface);
  if (!parts) return "";
  return parts.map((p) => EN_DIGIT_KATA[Number(p)] || "").join("");
}

/**
 * トークン列から 3.2.1 / 3. 2. 1 を最長で取る（空白可）。
 * @param {Array<{ surface_form?: string }>} tokens
 * @param {number} index
 */
function matchDotSeparatedDigitSpan(tokens, index) {
  if (!Array.isArray(tokens) || index >= tokens.length) return null;

  const first = tokens[index]?.surface_form || "";
  // 一塊「3.2.1」
  const aloneParts = parseDotSeparatedDigits(first);
  if (aloneParts) {
    const reading = readingForDotSeparatedDigits(aloneParts);
    if (!reading) return null;
    return {
      end: index + 1,
      surface: first,
      reading,
      preserveKatakana: true
    };
  }

  if (!isDigitToken(first) || toAsciiDigits(first).length !== 1) return null;

  let end = index;
  let surface = "";
  const parts = [];

  parts.push(toAsciiDigits(tokens[end].surface_form || ""));
  surface += tokens[end].surface_form || "";
  end += 1;

  let dots = 0;
  while (end < tokens.length) {
    const saveEnd = end;
    const saveSurface = surface;

    while (end < tokens.length && isSpaceToken(tokens[end].surface_form || "")) {
      surface += tokens[end].surface_form || "";
      end += 1;
    }
    if (end >= tokens.length || !isDotToken(tokens[end].surface_form || "")) {
      end = saveEnd;
      surface = saveSurface;
      break;
    }
    surface += tokens[end].surface_form || "";
    end += 1;
    dots += 1;

    while (end < tokens.length && isSpaceToken(tokens[end].surface_form || "")) {
      surface += tokens[end].surface_form || "";
      end += 1;
    }
    const dig = tokens[end]?.surface_form || "";
    if (!isDigitToken(dig) || toAsciiDigits(dig).length !== 1) {
      return null;
    }
    parts.push(toAsciiDigits(dig));
    surface += dig;
    end += 1;
  }

  if (dots < 2 || parts.length < 3) return null;
  const reading = readingForDotSeparatedDigits(parts);
  if (!reading) return null;
  return {
    end,
    surface,
    reading,
    preserveKatakana: true
  };
}

/**
 * tokens[i] から数字断片（＋あれば単位）を最長で取る。
 * @param {Array<{ surface_form?: string }>} tokens
 * @param {number} index
 * @returns {{ end: number, surface: string, reading: string, preserveKatakana: boolean } | null}
 */
export function matchNumberUnitTokenSpan(tokens, index) {
  if (!Array.isArray(tokens) || index >= tokens.length) return null;

  // 3.2.1 / 3. 2. 1 → スリーツーワン（小数 2.1 より先に判定）
  const dotted = matchDotSeparatedDigitSpan(tokens, index);
  if (dotted) return dotted;

  const first = tokens[index]?.surface_form || "";

  // 単位単独（Wh / V など）— 直前が数字断片なら数字側で取る
  if (isKnownNumberUnit(first)) {
    const prev = index > 0 ? tokens[index - 1]?.surface_form || "" : "";
    if (!isNumberFragmentToken(prev) && !isSpaceToken(prev)) {
      const alone = readingForUnitAlone(first);
      if (alone) {
        return {
          end: index + 1,
          surface: first,
          reading: alone,
          preserveKatakana: unitUsesKatakana(first)
        };
      }
    }
  }

  // すでに「12.8V」「1000円」一塊
  const aloneUnit = parseNumberUnitSurface(first);
  if (aloneUnit) {
    const alone = readingForNumberUnitSurface(first);
    if (alone) {
      return {
        end: index + 1,
        surface: first,
        reading: alone,
        preserveKatakana: unitUsesKatakana(aloneUnit.unit)
      };
    }
  }

  // すでに「12.8」「1000」一塊。次が単位・断片・空白なら延長
  const aloneNum = parseNumberSurface(first);
  if (aloneNum) {
    const next = tokens[index + 1]?.surface_form || "";
    if (!canExtendNumber(next)) {
      const hasFrac = aloneNum.fractionDigits != null;
      if (hasFrac || digitCharCount(first) >= 2) {
        const bare = readingForNumberSurface(first);
        if (bare) {
          return {
            end: index + 1,
            surface: first,
            reading: bare,
            preserveKatakana: false
          };
        }
      }
    }
  }

  if (!isDigitToken(first)) return null;

  let end = index;
  let surface = "";
  while (end < tokens.length && isNumberFragmentToken(tokens[end].surface_form || "")) {
    const piece = tokens[end].surface_form || "";
    if (end === index && (isCommaToken(piece) || isDotToken(piece))) return null;
    surface += piece;
    end += 1;
  }

  // 数字と単位の間の空白を許容
  while (end < tokens.length && isSpaceToken(tokens[end].surface_form || "")) {
    surface += tokens[end].surface_form || "";
    end += 1;
  }

  // 数字＋単位
  if (end < tokens.length && isKnownNumberUnit(tokens[end].surface_form || "")) {
    const unit = tokens[end].surface_form || "";
    const withUnit = `${surface}${unit}`;
    const reading = readingForNumberUnitSurface(withUnit);
    if (!reading) return null;
    return {
      end: end + 1,
      surface: withUnit,
      reading,
      preserveKatakana: unitUsesKatakana(unit)
    };
  }

  // 単位なし: 小数 or 2桁以上
  const bareCore = parseNumberSurface(surface);
  if (!bareCore) return null;
  if (bareCore.fractionDigits == null && digitCharCount(surface) < 2) return null;
  const reading = readingForNumberSurface(surface);
  if (!reading) return null;
  return {
    end,
    surface,
    reading,
    preserveKatakana: false
  };
}

/**
 * 数字＋単位トークンを結合し、規則読みを載せる。
 * @param {Array<object>} tokens
 * @returns {Array<object>}
 */
export function applyNumberUnitReadings(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const result = [];
  let index = 0;
  while (index < tokens.length) {
    const match = matchNumberUnitTokenSpan(tokens, index);
    if (!match) {
      result.push(tokens[index]);
      index += 1;
      continue;
    }

    if (match.end === index + 1) {
      const token = tokens[index];
      result.push({
        ...token,
        reading: match.reading,
        pronunciation: match.reading,
        preserveKatakana: match.preserveKatakana || token.preserveKatakana
      });
    } else {
      const merged = {
        ...tokens[index],
        surface_form: match.surface,
        reading: match.reading,
        pronunciation: match.reading,
        basic_form: match.surface,
        pos: "名詞",
        pos_detail_1: "数単位",
        conjugated_form: "*",
        _merged: true,
        _numberUnit: true,
        preserveKatakana: match.preserveKatakana
      };
      result.push(merged);
    }
    index = match.end;
  }
  return result;
}

export { UNIT_SPECS };
