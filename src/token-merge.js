import { normalizeReading } from "./reading-normalize.js";
import {
  getDictionarySurfaces,
  findLongestDictionaryMatchAt
} from "./dictionary-match.js";
import { getNeologdReading } from "./neologd-phrases.js";
import { findLongestPhraseAt } from "./phrase-trie.js";
import { applyNumberUnitReadings } from "./number-unit-reading.js";

function toHiragana(text) {
  return normalizeReading(text);
}

function readingOf(token) {
  return toHiragana(token.reading || token.pronunciation || "");
}

/**
 * 明示的な結合ルール（辞書に依存しない）。
 * 読み登録用の語・句単位。形態素そのものではない。
 */
const EXPLICIT_COMPOUND_RULES = [
  { parts: ["何", "故", "か"], reading: "なぜか" },
  { parts: ["何", "故"], reading: "なぜ" },
  { parts: ["何故", "か"], reading: "なぜか" },
  { parts: ["何故", "に"], reading: "なぜに" },
  // 数詞の「何」+ 助数詞（Kuromoji は 何/ナン + 度/ド に割る）
  { parts: ["何", "度"], reading: "なんど" },
  { parts: ["何", "回"], reading: "なんかい" },
  { parts: ["何", "人"], reading: "なんにん" },
  { parts: ["何", "年"], reading: "なんねん" },
  { parts: ["何", "枚"], reading: "なんまい" },
  { parts: ["何", "冊"], reading: "なんさつ" },
  { parts: ["何", "階"], reading: "なんかい" },
  { parts: ["何", "倍"], reading: "なんばい" },
  { parts: ["直", "書き"], reading: "じかがき" }
];

function dictionaryReadingFor(surface) {
  const fallback = {
    何故: "なぜ",
    何故か: "なぜか",
    何故に: "なぜに",
    如何: "いかが",
    如何に: "いかに",
    如何して: "どうして",
    何度: "なんど",
    何回: "なんかい",
    何人: "なんにん",
    何年: "なんねん",
    何枚: "なんまい",
    何冊: "なんさつ",
    何階: "なんかい",
    何倍: "なんばい",
    直書き: "じかがき"
  };
  return fallback[surface] || getNeologdReading(surface) || "";
}

/**
 * 小さな複合語セット + NEologd Trie の最長一致。
 * @param {string} text
 * @param {number} index
 * @param {Set<string>} surfaces
 * @param {import("./phrase-trie.js").buildPhraseTrie extends Function ? any : any} [phraseTrie]
 */
function findBestMatchAt(text, index, surfaces, phraseTrie) {
  const neo = phraseTrie ? findLongestPhraseAt(phraseTrie, text, index) : null;
  const dict = findLongestDictionaryMatchAt(text, index, surfaces);
  if (neo && dict) {
    return neo.surface.length >= dict.length
      ? { surface: neo.surface, reading: neo.reading }
      : { surface: dict, reading: dictionaryReadingFor(dict) };
  }
  if (neo) return { surface: neo.surface, reading: neo.reading };
  if (dict) return { surface: dict, reading: dictionaryReadingFor(dict) };
  return null;
}

function isPrefixToken(token) {
  const pos = token.pos || "";
  return pos === "接頭詞" || pos.startsWith("接頭詞");
}

/** 大/小 など短い接頭＋名詞は一塊（大正解が「大｜正解」に割れて改行するのを防ぐ） */
const SHORT_NOUN_PREFIXES = new Set([
  "大",
  "小",
  "超",
  "未",
  "再",
  "新",
  "旧",
  "真",
  "元",
  "本"
]);

function isShortNounPrefix(token) {
  return (
    isPrefixToken(token) &&
    SHORT_NOUN_PREFIXES.has(String(token.surface_form || ""))
  );
}

function isNoun(token) {
  const pos = token.pos || "";
  return pos === "名詞" || pos.startsWith("名詞");
}

/** 名詞接尾（直+書き、夏+日 など） */
function isNounSuffix(token) {
  const pos = token.pos || "";
  if (!(pos === "名詞" || pos.startsWith("名詞"))) return false;
  const detail = token.pos_detail_1 || token.posDetail1 || "";
  return String(detail).includes("接尾");
}

function isNounSuffixDay(token) {
  if ((token.surface_form || "") !== "日") return false;
  if (isNounSuffix(token)) return true;
  const pos = token.pos || "";
  if (pos === "名詞" || pos.startsWith("名詞")) return true;
  if (pos.includes("接尾")) return true;
  return false;
}

function isRenyouTaVerb(token) {
  const pos = token.pos || "";
  if (!(pos === "動詞" || pos.startsWith("動詞"))) return false;
  const conjugated = token.conjugated_form || token.conjugatedForm || "";
  if (String(conjugated).includes("連用タ接続")) return true;
  return false;
}

function isAuxiliaryTa(token) {
  const surface = token.surface_form || "";
  if (surface !== "た" && surface !== "だ") return false;
  const pos = token.pos || "";
  return pos === "助動詞" || pos.startsWith("助動詞") || pos === "助動詞";
}

function looksLikeTaRenyouStem(token) {
  const surface = token.surface_form || "";
  const pos = token.pos || "";
  if (!(pos === "動詞" || pos.startsWith("動詞"))) return false;
  return /[いっっ]$/.test(surface) || /[きぎびみり]$/.test(surface);
}

/** 形容詞連用形・副詞の「〜く」（遠く・大きく など） */
function isKuAdverbial(token) {
  const surface = token.surface_form || "";
  if (!surface.endsWith("く") || surface.length < 2) return false;
  const pos = token.pos || "";
  return (
    pos === "形容詞" ||
    pos.startsWith("形容詞") ||
    pos === "副詞" ||
    pos.startsWith("副詞")
  );
}

function isNaruVerb(token) {
  if ((token.surface_form || "") !== "なる") return false;
  const pos = token.pos || "";
  return pos === "動詞" || pos.startsWith("動詞");
}

function isKatakanaOnlySurface(surface) {
  return /^[\u30a0-\u30ffー]+$/.test(String(surface || ""));
}

function mergeTokenPair(left, right, { useDictionaryReading = false } = {}) {
  const leftSurface = left.surface_form || "";
  const rightSurface = right.surface_form || "";
  const surface = `${leftSurface}${rightSurface}`;
  // カタカナ未知語は reading が空でも表層をひらがな化して結合読みに載せる
  // （カツアゲ+放題 → かつあげほうだい。空のままだと「放題」のルビが消える）
  const leftReading =
    readingOf(left) ||
    (isKatakanaOnlySurface(leftSurface) ? toHiragana(leftSurface) : "");
  const rightReading =
    readingOf(right) ||
    (isKatakanaOnlySurface(rightSurface) ? toHiragana(rightSurface) : "");
  const dictReading = useDictionaryReading
    ? dictionaryReadingFor(surface)
    : "";

  // 漢字側の読みが欠ける結合では「に」だけ残る部分読みを作らない
  // （随+に → 「に」など）。未登録のままにしてピッカーで選ばせる。
  const hasKanjiChar = (value) =>
    /[\u3400-\u9fff\uF900-\uFAFF]/.test(value || "");
  const incomplete =
    (hasKanjiChar(leftSurface) && !leftReading) ||
    (hasKanjiChar(rightSurface) && !rightReading);

  const reading =
    dictReading || (incomplete ? "" : `${leftReading}${rightReading}`);
  return {
    ...left,
    surface_form: surface,
    reading,
    pronunciation: reading,
    basic_form: surface,
    pos: left.pos || "名詞",
    pos_detail_1: "複合",
    conjugated_form: "*",
    _merged: true
  };
}

function mergeTokenRange(tokens, start, end, reading = "") {
  let merged = tokens[start];
  for (let index = start + 1; index < end; index += 1) {
    merged = mergeTokenPair(merged, tokens[index], {
      useDictionaryReading: !reading
    });
  }
  if (reading) {
    const normalized = normalizeReading(reading);
    merged = {
      ...merged,
      reading: normalized,
      pronunciation: normalized
    };
  }
  return merged;
}

function matchExplicitCompound(tokens, index) {
  for (const rule of EXPLICIT_COMPOUND_RULES) {
    if (index + rule.parts.length > tokens.length) continue;
    let ok = true;
    for (let offset = 0; offset < rule.parts.length; offset += 1) {
      if ((tokens[index + offset].surface_form || "") !== rule.parts[offset]) {
        ok = false;
        break;
      }
    }
    if (ok) return rule;
  }
  return null;
}

/**
 * 辞書最長一致。トークン境界で覆えない場合は短い候補へ落とす。
 * NEologd は Trie、その他は小さな表層セットで照合する。
 */
function mergeByDictionaryLongestMatch(tokens, surfaces, phraseTrie = null) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const fullText = tokens.map((token) => token.surface_form || "").join("");
  const result = [];
  let tokenIndex = 0;
  let charIndex = 0;

  while (tokenIndex < tokens.length) {
    const currentSurface = tokens[tokenIndex].surface_form || "";
    let merged = false;

    /** @type {Array<{ surface: string, reading: string }>} */
    const candidates = [];
    const best = findBestMatchAt(fullText, charIndex, surfaces, phraseTrie);
    if (best) candidates.push(best);

    // 何故 / 何故か など短い候補も明示的に足す
    for (const fallback of ["何故か", "何故に", "何故"]) {
      if (
        fullText.startsWith(fallback, charIndex) &&
        fallback.length > currentSurface.length &&
        !candidates.some((c) => c.surface === fallback)
      ) {
        candidates.push({
          surface: fallback,
          reading: dictionaryReadingFor(fallback)
        });
      }
    }
    candidates.sort((a, b) => b.surface.length - a.surface.length);

    for (const match of candidates) {
      if (match.surface.length <= currentSurface.length) continue;
      let covered = "";
      let end = tokenIndex;
      while (end < tokens.length && covered.length < match.surface.length) {
        covered += tokens[end].surface_form || "";
        end += 1;
      }
      if (covered !== match.surface) continue;

      result.push(
        mergeTokenRange(
          tokens,
          tokenIndex,
          end,
          match.reading || dictionaryReadingFor(match.surface)
        )
      );
      tokenIndex = end;
      charIndex += match.surface.length;
      merged = true;
      break;
    }

    if (merged) continue;

    result.push(tokens[tokenIndex]);
    charIndex += currentSurface.length;
    tokenIndex += 1;
  }

  return result;
}

/**
 * ルビ／候補UI用に、意味のまとまりへトークンを結合する。
 * 形態素そのものではなく、読み登録しやすい語・句単位。
 * 例: 何+故+か → 何故か、遠く+なる → 遠くなる
 * @param {Array<object>} tokens
 * @param {{ extraSurfaces?: Iterable<string>, phraseTrie?: object | null }} [options]
 */
export function mergeTokensForRuby(tokens, options = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  // 0) 数字＋単位（0時 / 7,000円 / 1人）を規則読みで固める
  const numbered = applyNumberUnitReadings(tokens);

  // 1) 明示ルール（何+故+か など）を先に適用
  const explicitMerged = [];
  let index = 0;
  while (index < numbered.length) {
    const rule = matchExplicitCompound(numbered, index);
    if (rule) {
      explicitMerged.push(
        mergeTokenRange(
          numbered,
          index,
          index + rule.parts.length,
          rule.reading
        )
      );
      index += rule.parts.length;
      continue;
    }
    explicitMerged.push(numbered[index]);
    index += 1;
  }

  // 2) 辞書最長一致（NEologd Trie + 小規模セット）
  const surfaces = getDictionarySurfaces(options.extraSurfaces || []);
  const dictionaryMerged = mergeByDictionaryLongestMatch(
    explicitMerged,
    surfaces,
    options.phraseTrie || null
  );

  // 3) 汎用ルール
  const result = [];
  index = 0;

  while (index < dictionaryMerged.length) {
    const current = dictionaryMerged[index];
    const next = dictionaryMerged[index + 1];

    if (
      next &&
      isNoun(current) &&
      (isNounSuffix(next) || isNounSuffixDay(next))
    ) {
      result.push(
        mergeTokenPair(current, next, { useDictionaryReading: true })
      );
      index += 2;
      continue;
    }

    if (next && isShortNounPrefix(current) && isNoun(next)) {
      result.push(mergeTokenPair(current, next));
      index += 2;
      continue;
    }

    if (
      next &&
      isAuxiliaryTa(next) &&
      (isRenyouTaVerb(current) || looksLikeTaRenyouStem(current))
    ) {
      result.push(mergeTokenPair(current, next));
      index += 2;
      continue;
    }

    if (next && isKuAdverbial(current) && isNaruVerb(next)) {
      result.push(mergeTokenPair(current, next));
      index += 2;
      continue;
    }

    // RubiPon 長単位の狭い版: 副詞「何故」+ 助詞「か/に」だけ
    // （世界+を などを全部くっつけると読み登録単位が壊れる）
    if (
      next &&
      (current.surface_form === "何故" || current.surface_form === "如何") &&
      (next.surface_form === "か" || next.surface_form === "に") &&
      ((next.pos || "").startsWith("助詞") || next.pos === "助詞")
    ) {
      result.push(
        mergeTokenPair(current, next, { useDictionaryReading: true })
      );
      index += 2;
      continue;
    }

    result.push(current);
    index += 1;
  }

  return result;
}
