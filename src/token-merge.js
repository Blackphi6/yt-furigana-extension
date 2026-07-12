import { normalizeReading } from "./reading-normalize.js";
import {
  getDictionarySurfaces,
  findLongestDictionaryMatchAt
} from "./dictionary-match.js";

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
    直書き: "じかがき"
  };
  return fallback[surface] || "";
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

function mergeTokenPair(left, right, { useDictionaryReading = false } = {}) {
  const surface = `${left.surface_form || ""}${right.surface_form || ""}`;
  const concatenated = `${readingOf(left)}${readingOf(right)}`;
  const dictReading = useDictionaryReading
    ? dictionaryReadingFor(surface)
    : "";
  const reading = dictReading || concatenated;
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
 */
function mergeByDictionaryLongestMatch(tokens, surfaces) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  const fullText = tokens.map((token) => token.surface_form || "").join("");
  const result = [];
  let tokenIndex = 0;
  let charIndex = 0;

  while (tokenIndex < tokens.length) {
    const currentSurface = tokens[tokenIndex].surface_form || "";
    let merged = false;

    // 長い順に試す。境界不一致なら短い表層へ
    const candidates = [];
    const longest = findLongestDictionaryMatchAt(fullText, charIndex, surfaces);
    if (longest) candidates.push(longest);
    // 何故 / 何故か など短い候補も明示的に足す
    for (const fallback of ["何故か", "何故に", "何故"]) {
      if (
        fullText.startsWith(fallback, charIndex) &&
        fallback.length > currentSurface.length &&
        !candidates.includes(fallback)
      ) {
        candidates.push(fallback);
      }
    }
    candidates.sort((a, b) => b.length - a.length);

    for (const match of candidates) {
      if (match.length <= currentSurface.length) continue;
      let covered = "";
      let end = tokenIndex;
      while (end < tokens.length && covered.length < match.length) {
        covered += tokens[end].surface_form || "";
        end += 1;
      }
      if (covered !== match) continue;

      result.push(
        mergeTokenRange(tokens, tokenIndex, end, dictionaryReadingFor(match))
      );
      tokenIndex = end;
      charIndex += match.length;
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
 * @param {{ extraSurfaces?: Iterable<string> }} [options]
 */
export function mergeTokensForRuby(tokens, options = {}) {
  if (!Array.isArray(tokens) || tokens.length === 0) return [];

  // 1) 明示ルール（何+故+か など）を先に適用
  const explicitMerged = [];
  let index = 0;
  while (index < tokens.length) {
    const rule = matchExplicitCompound(tokens, index);
    if (rule) {
      explicitMerged.push(
        mergeTokenRange(tokens, index, index + rule.parts.length, rule.reading)
      );
      index += rule.parts.length;
      continue;
    }
    explicitMerged.push(tokens[index]);
    index += 1;
  }

  // 2) 辞書最長一致
  const surfaces = getDictionarySurfaces(options.extraSurfaces || []);
  const dictionaryMerged = mergeByDictionaryLongestMatch(
    explicitMerged,
    surfaces
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
