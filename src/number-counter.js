/**
 * 数詞＋助数詞（三本・六匹・3本）の読みを規則で決め、形態素列に当てる。
 * 解析器は 三本 を さんぽん（Sudachi）や人名の みつもと（kuromoji）と読むことがある。
 */
import { parseNumberUnitSurface, readNumberWithUnit } from "./number-unit-reading.js";

const KANJI_DIGIT = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const KANJI_SMALL_UNIT = { 十: 10, 百: 100, 千: 1000 };
const KANJI_NUMERAL_RE = /^[〇零一二三四五六七八九十百千万]+$/;

/**
 * 文脈で読みが変わる（一日＝いちにち／ついたち）か、特別な読み（二十歳＝はたち）の語。
 * 規則では決めず、解析器と文脈の段に任せる。
 */
const LEAVE_TO_CONTEXT = new Set([
  "一日", "一月", "一時", "一分", "十分", "二十歳", "二十日", "一人", "二人", "一倍"
]);

/**
 * 漢数字を整数にする。位取り（二十一）と並べ書き（二〇二六）の両方。読めなければ null。
 * @param {string} text
 * @returns {number | null}
 */
export function kanjiNumeralToInt(text) {
  const s = String(text || "");
  if (!KANJI_NUMERAL_RE.test(s)) return null;
  // 位の字が無ければ並べ書き（二〇二六）
  if (![...s].some((ch) => ch in KANJI_SMALL_UNIT || ch === "万")) {
    return Number([...s].map((ch) => KANJI_DIGIT[ch]).join(""));
  }
  let total = 0;
  let section = 0;
  let digit = null;
  for (const ch of s) {
    if (ch in KANJI_DIGIT) {
      if (digit != null) return null;
      digit = KANJI_DIGIT[ch];
    } else if (ch in KANJI_SMALL_UNIT) {
      section += (digit ?? 1) * KANJI_SMALL_UNIT[ch];
      digit = null;
    } else {
      // 万
      total += (section + (digit ?? 0) || 1) * 10000;
      section = 0;
      digit = null;
    }
  }
  return total + section + (digit ?? 0);
}

/**
 * 数詞＋助数詞の表記から読み。規則で決めない語・読めない語は空文字。
 * @param {string} surface
 */
export function readingForNumberWithCounter(surface) {
  const s = String(surface || "").normalize("NFKC").trim();
  if (!s || LEAVE_TO_CONTEXT.has(s)) return "";
  const unit = s.slice(-1);
  const kanjiNumber = kanjiNumeralToInt(s.slice(0, -1));
  if (kanjiNumber != null) return readNumberWithUnit(kanjiNumber, unit);
  const parsed = parseNumberUnitSurface(s);
  if (!parsed || parsed.fractionDigits != null) return "";
  return readNumberWithUnit(parsed.number, parsed.unit);
}

const surfaceOf = (token) => token?.surface_form ?? token?.surface ?? "";

/**
 * 形態素列の数詞＋助数詞に規則の読みを当てる。数詞と助数詞が別の語なら1語にまとめる。
 * 入力は変更しない。
 * @template T
 * @param {T[]} tokens
 * @returns {T[]}
 */
export function applyNumberCounterReadings(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    const joined = next ? surfaceOf(token) + surfaceOf(next) : "";
    const joinedReading = next && surfaceOf(next).length === 1 ? readingForNumberWithCounter(joined) : "";
    if (joinedReading) {
      out.push({ ...token, surface_form: joined, reading: joinedReading, pronunciation: joinedReading });
      i += 1;
      continue;
    }
    const reading = readingForNumberWithCounter(surfaceOf(token));
    out.push(reading ? { ...token, reading, pronunciation: reading } : token);
  }
  return out;
}
