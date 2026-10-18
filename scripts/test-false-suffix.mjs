// kuromoji が 2字以上の語のあとの「雨」を接尾語（豪雨の う）と読む誤りを、結合の前に直す
import assert from "node:assert/strict";
import { repairFalseKanjiSuffix } from "furigana-ruby-engine/lib/reading-guards.js";

const tokens = [
  { surface_form: "一日中", reading: "イチニチジュウ", pos: "名詞", pos_detail_1: "一般" },
  { surface_form: "雨", reading: "ウ", pos: "名詞", pos_detail_1: "接尾" },
  { surface_form: "が", reading: "ガ", pos: "助詞", pos_detail_1: "格助詞" }
];
const repaired = repairFalseKanjiSuffix(tokens);
assert.equal(repaired[1].reading, "アメ");
assert.equal(repaired[1].pos_detail_1, "一般", "接尾語扱いをやめて前の語と結合させない");
assert.equal(tokens[1].reading, "ウ", "入力は変更しない");

// Sudachi の形（品詞が 接尾辞、細分類なし）
const sudachi = repairFalseKanjiSuffix([
  { surface_form: "日中", reading: "ニッチュウ", pos: "名詞" },
  { surface_form: "雨", reading: "ウ", pos: "接尾辞" }
]);
assert.equal(sudachi[1].reading, "アメ");
assert.equal(sudachi[1].pos, "名詞");

// 1字の語のあと（豪雨・雷雨）は本物の接尾語なのでそのまま
const gouu = repairFalseKanjiSuffix([
  { surface_form: "豪", reading: "ゴウ", pos: "接頭詞", pos_detail_1: "名詞接続" },
  { surface_form: "雨", reading: "ウ", pos: "名詞", pos_detail_1: "接尾" }
]);
assert.equal(gouu[1].reading, "ウ");
// 対象外の漢字（和風の 風 など）は触らない
const wafuu = repairFalseKanjiSuffix([
  { surface_form: "日本", reading: "ニホン", pos: "名詞", pos_detail_1: "固有名詞" },
  { surface_form: "風", reading: "フウ", pos: "名詞", pos_detail_1: "接尾" }
]);
assert.equal(wafuu[1].reading, "フウ");
assert.deepEqual(repairFalseKanjiSuffix([]), []);
console.log("接尾語の誤読修正のテスト: 問題なし");
