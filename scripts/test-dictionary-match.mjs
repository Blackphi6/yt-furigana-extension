import assert from "node:assert/strict";
import {
  expandSurfaceWithDictionary,
  findLongestDictionaryMatchAt,
  getDictionarySurfaces
} from "../src/dictionary-match.js";
import { mergeTokensForRuby } from "../src/token-merge.js";
import { collectReadingCandidates } from "../src/reading-candidates.js";
import { buildFuriganaHtml } from "../src/furigana.js";
import {
  MANUAL_PHRASE_READINGS,
  rebuildManualPhraseIndex
} from "../src/reading-context.js";

const surfaces = getDictionarySurfaces();

assert.equal(findLongestDictionaryMatchAt("何故か遠くなる", 0, surfaces), "何故か");

const splitTokens = [
  { surface_form: "何", reading: "ナニ", pos: "名詞" },
  { surface_form: "故", reading: "ユエ", pos: "名詞" },
  { surface_form: "か", reading: "カ", pos: "助詞" },
  { surface_form: "遠く", reading: "トオク", pos: "形容詞" },
  { surface_form: "なる", reading: "ナル", pos: "動詞" }
];

const merged = mergeTokensForRuby(splitTokens, {
  extraSurfaces: MANUAL_PHRASE_READINGS.keys()
});
assert.deepEqual(
  merged.map((t) => t.surface_form),
  ["何故か", "遠くなる"],
  merged.map((t) => t.surface_form)
);

// 明示ルールだけで辞書なしでも結合できること
const withoutDict = mergeTokensForRuby(splitTokens, { extraSurfaces: [] });
assert.deepEqual(
  withoutDict.map((t) => t.surface_form),
  ["何故か", "遠くなる"]
);

// 「何」単体の候補に「なぜか」が混ざらないこと
const naniCandidates = collectReadingCandidates("何", "なに", "何故か遠くなる", {
  何故か: "なんゆえか"
});
assert.ok(
  !naniCandidates.some((c) => c.reading === "なぜか" || c.reading === "なんゆえか"),
  naniCandidates
);
assert.ok(naniCandidates.some((c) => c.reading === "なに" || c.reading === "なん"), naniCandidates);

const nazeCandidates = collectReadingCandidates("何故か", "なぜか", "何故か遠くなる");
assert.ok(nazeCandidates.some((c) => c.reading === "なんゆえか"), nazeCandidates);

const html = buildFuriganaHtml("何故か遠くなる", () => splitTokens);
assert.ok(html.includes('data-surface="何故か"'), html);
assert.ok(html.includes('data-surface="遠くなる"'), html);
assert.ok(!html.includes('data-surface="何"'), html);
assert.ok(!html.includes('data-surface="遠く"'), html);

// ユーザーが「何」を登録していても、原文先切りで「何故か」を壊さない（るびポン同等）
MANUAL_PHRASE_READINGS.set("何", "なに");
rebuildManualPhraseIndex();
const htmlWithNani = buildFuriganaHtml("何故か遠くなる", () => splitTokens);
assert.ok(htmlWithNani.includes('data-surface="何故か"'), htmlWithNani);
assert.ok(!htmlWithNani.includes('data-surface="何"'), htmlWithNani);
assert.ok(!htmlWithNani.includes('data-surface="故"'), htmlWithNani);
MANUAL_PHRASE_READINGS.delete("何");
rebuildManualPhraseIndex();

// Sudachi 風: 何故 / か → 長単位で 何故か
const sudachiLike = mergeTokensForRuby([
  { surface_form: "何故", reading: "ナゼ", pos: "副詞" },
  { surface_form: "か", reading: "カ", pos: "助詞" },
  { surface_form: "遠く", reading: "トオク", pos: "形容詞" },
  { surface_form: "なる", reading: "ナル", pos: "動詞" }
]);
assert.deepEqual(
  sudachiLike.map((t) => t.surface_form),
  ["何故か", "遠くなる"]
);

// expand helper は残すが、picker では使わない
assert.equal(
  expandSurfaceWithDictionary("何", "何故か遠くなる", surfaces),
  "何故か"
);

// 直書き = じかがき（名詞+接尾がバラけない）
const jikagakiTokens = [
  {
    surface_form: "直",
    reading: "ジカ",
    pos: "名詞",
    pos_detail_1: "一般"
  },
  {
    surface_form: "書き",
    reading: "ガキ",
    pos: "名詞",
    pos_detail_1: "接尾"
  },
  {
    surface_form: "さ",
    reading: "サ",
    pos: "動詞",
    pos_detail_1: "自立"
  }
];
const jikagakiMerged = mergeTokensForRuby(jikagakiTokens);
assert.equal(jikagakiMerged[0].surface_form, "直書き");
assert.equal(jikagakiMerged[0].reading, "じかがき");
const jikagakiHtml = buildFuriganaHtml("直書きされていた", () => [
  ...jikagakiTokens,
  { surface_form: "れ", reading: "レ", pos: "動詞", pos_detail_1: "接尾" },
  { surface_form: "て", reading: "テ", pos: "助詞" },
  { surface_form: "い", reading: "イ", pos: "動詞" },
  { surface_form: "た", reading: "タ", pos: "助動詞" }
]);
assert.ok(jikagakiHtml.includes('data-surface="直書き"'), jikagakiHtml);
assert.ok(jikagakiHtml.includes('data-reading="じかがき"'), jikagakiHtml);
assert.ok(!jikagakiHtml.includes('data-surface="直"'), jikagakiHtml);

console.log("dictionary-match / 何故か・遠くなる tests passed.");
console.log(html);
