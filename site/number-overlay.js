/**
 * デモ用: API が返さない数字スパンに規則読みを載せる。
 * GitHub Pages は site/ のみのため、拡張の number-unit-reading と独立実装。
 */

const DIGIT = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
const DIGIT_SEQ_HIRA = [
  "ぜろ",
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
const DIGIT_SEQ_KATA = [
  "ゼロ",
  "イチ",
  "ニー",
  "サン",
  "ヨン",
  "ゴー",
  "ロク",
  "ナナ",
  "ハチ",
  "キュー"
];

const NUMBER_RUN_RE =
  /[0-9０-９]+(?:,[0-9０-９]+)*(?:\.[0-9０-９]+)?/g;

/**
 * @param {string} text
 * @returns {string}
 */
function toAsciiDigits(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
    )
    .replace(/[,，]/g, "");
}

/**
 * @param {number} n
 * @returns {string}
 */
function readUnder1000(n) {
  if (n <= 0) return "";
  if (n < 10) return DIGIT[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    let out = tens === 1 ? "じゅう" : `${DIGIT[tens]}じゅう`;
    if (ones) out += DIGIT[ones];
    return out;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (hundreds === 1) out = "ひゃく";
  else if (hundreds === 3) out = "さんびゃく";
  else if (hundreds === 6) out = "ろっぴゃく";
  else if (hundreds === 8) out = "はっぴゃく";
  else out = `${DIGIT[hundreds]}ひゃく`;
  return out + readUnder1000(rest);
}

/**
 * @param {number} n
 * @returns {string}
 */
export function readCardinal(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999_9999_9999) return "";
  if (n === 0) return "ぜろ";

  const parts = [];
  const oku = Math.floor(n / 1_0000_0000);
  const man = Math.floor((n % 1_0000_0000) / 1_0000);
  const rest = n % 1_0000;

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
  return parts.join("");
}

/**
 * @param {string} numberPart
 * @returns {{ reading: string, integer: number, digits: string } | null}
 */
export function readingForDigitRun(numberPart) {
  const cleaned = toAsciiDigits(numberPart);
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [intPart, fracPart] = cleaned.split(".");
  const integer = Number.parseInt(intPart, 10);
  if (!Number.isFinite(integer)) return null;

  let reading =
    integer === 0 && fracPart == null ? "ぜろ" : readCardinal(integer);
  if (fracPart != null) {
    const fracRead = [...fracPart]
      .map((d) => DIGIT_SEQ_HIRA[Number(d)] || "")
      .join("");
    const head = integer === 0 ? "れい" : reading;
    reading = `${head}てん${fracRead}`;
  }
  if (!reading) return null;
  return { reading, integer, digits: cleaned };
}

/**
 * 逐語読み（電話番号風）候補。
 * @param {string} digits
 * @param {"hira"|"kata"} style
 */
export function digitByDigitReading(digits, style = "hira") {
  const cleaned = toAsciiDigits(digits).replace(/\./g, "");
  if (!/^\d+$/.test(cleaned) || cleaned.length < 1) return "";
  const table = style === "kata" ? DIGIT_SEQ_KATA : DIGIT_SEQ_HIRA;
  return [...cleaned].map((d) => table[Number(d)] || "").join("");
}

/**
 * @param {string} primary
 * @param {string} digits
 * @returns {string[]}
 */
export function numberReadingCandidates(primary, digits) {
  const list = [];
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s || list.includes(s)) return;
    list.push(s);
  };
  push(primary);
  const hira = digitByDigitReading(digits, "hira");
  if (hira && hira !== primary) push(hira);
  const kata = digitByDigitReading(digits, "kata");
  if (kata) push(kata);
  return list;
}

/**
 * 階・回などカ行助数詞の促音（21階→にじゅういっかい）。
 * @param {number} number
 * @param {string} suffix かい など
 */
export function readKaiStyleCounter(number, suffix = "かい") {
  if (!Number.isInteger(number) || number < 0) return "";
  const unit = String(suffix || "かい");
  if (number === 0) return `ぜろ${unit}`;
  if (number % 10 === 0 && number >= 10 && number <= 90) {
    const t = number / 10;
    const head = t === 1 ? "" : t === 2 ? "に" : DIGIT[t];
    return `${head}じゅっ${unit}`;
  }
  const last = number % 10;
  if (last === 1) {
    const head = number === 1 ? "" : readCardinal(number - 1);
    return `${head}いっ${unit}`;
  }
  if (last === 6) {
    const head = number === 6 ? "" : readCardinal(number - 6);
    return `${head}ろっ${unit}`;
  }
  if (last === 8) {
    const head = number === 8 ? "" : readCardinal(number - 8);
    return `${head}はっ${unit}`;
  }
  const cardinal = readCardinal(number);
  return cardinal ? `${cardinal}${unit}` : "";
}

/** 直後にくっつけると促音化する助数詞 */
const KAI_STYLE_UNITS = {
  階: "かい",
  回: "かい"
};

/**
 * テキスト中の数字ラン（＋階/回）をトークン化する。
 * @param {string} text
 * @returns {{ surface: string, span: [number, number], reading: string, confidence: number, source: string, candidates: string[] }[]}
 */
export function collectNumberTokens(text) {
  const src = String(text || "");
  /** @type {ReturnType<typeof collectNumberTokens>} */
  const out = [];
  NUMBER_RUN_RE.lastIndex = 0;
  let m;
  while ((m = NUMBER_RUN_RE.exec(src))) {
    const digitSurface = m[0];
    const start = m.index;
    let end = start + digitSurface.length;
    const parsed = readingForDigitRun(digitSurface);
    if (!parsed) continue;

    const nextChar = src.slice(end, end + 1);
    const unitReading = KAI_STYLE_UNITS[nextChar];
    if (unitReading) {
      end += 1;
      const surface = src.slice(start, end);
      const reading = readKaiStyleCounter(parsed.integer, unitReading);
      if (!reading) continue;
      // 誤結合しやすい「いちかい」も候補に残し、クリックで直せるようにする
      const loose = `${parsed.reading}${unitReading}`;
      const candidates = numberReadingCandidates(reading, parsed.digits);
      if (loose !== reading) candidates.push(loose);
      out.push({
        surface,
        span: [start, end],
        reading,
        confidence: 0.92,
        source: "number_rule",
        candidates
      });
      // 数字ランの次が単位なので、次の exec 位置を進める
      NUMBER_RUN_RE.lastIndex = end;
      continue;
    }

    const candidates = numberReadingCandidates(parsed.reading, parsed.digits);
    out.push({
      surface: digitSurface,
      span: [start, end],
      reading: parsed.reading,
      confidence: 0.9,
      source: "number_rule",
      candidates
    });
  }
  return out;
}

/**
 * @param {string} text
 * @param {any[]} tokens
 * @returns {any[]}
 */
export function overlayNumberTokens(text, tokens) {
  const numbers = collectNumberTokens(text);
  if (!numbers.length) return tokens || [];
  const existing = tokens || [];
  // 数字＋階 が漢字「階」トークンと重なるので、重なりは数字側を優先
  const kept = existing.filter((t) => {
    const [a, b] = t.span || [0, 0];
    return !numbers.some((n) => a < n.span[1] && b > n.span[0]);
  });
  const preferred = existing.filter((t) => {
    const src = String(t.source || "");
    if (src !== "user_dict" && src !== "personal_name") return false;
    const [a, b] = t.span || [0, 0];
    return numbers.some((n) => a === n.span[0] && b === n.span[1]);
  });
  const preferredKeys = new Set(
    preferred.map((t) => `${t.span[0]}:${t.span[1]}`)
  );
  const result = [...kept];
  for (const n of numbers) {
    const key = `${n.span[0]}:${n.span[1]}`;
    if (preferredKeys.has(key)) continue;
    result.push(n);
  }
  for (const p of preferred) {
    if (!result.includes(p)) result.push(p);
  }
  result.sort((a, b) => (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0));
  return result;
}

/**
 * トークンからかな通しを再構築（数字ギャップを埋めた表示用）。
 * @param {string} text
 * @param {any[]} tokens
 * @returns {string}
 */
export function rebuildFullReading(text, tokens) {
  const src = String(text || "");
  const sorted = [...(tokens || [])].sort(
    (a, b) => (a.span?.[0] ?? 0) - (b.span?.[0] ?? 0)
  );
  let out = "";
  let pos = 0;
  for (const t of sorted) {
    const [a, b] = t.span || [0, 0];
    if (a < pos) continue;
    if (a > pos) out += src.slice(pos, a);
    out += t.reading || src.slice(a, b);
    pos = b;
  }
  if (pos < src.length) out += src.slice(pos);
  return out.normalize("NFKC");
}
