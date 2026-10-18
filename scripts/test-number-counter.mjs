// 数詞＋助数詞の読み（漢数字・算用数字）と、形態素列への適用
import assert from "node:assert/strict";
import { readNumberWithUnit } from "furigana-ruby-engine/lib/number-unit-reading.js";
import {
  applyNumberCounterReadings,
  kanjiNumeralToInt,
  readingForNumberWithCounter
} from "furigana-ruby-engine/lib/number-counter.js";

// 漢数字
assert.equal(kanjiNumeralToInt("三"), 3);
assert.equal(kanjiNumeralToInt("十"), 10);
assert.equal(kanjiNumeralToInt("二十一"), 21);
assert.equal(kanjiNumeralToInt("百五"), 105);
assert.equal(kanjiNumeralToInt("三千二百"), 3200);
assert.equal(kanjiNumeralToInt("一万"), 10000);
assert.equal(kanjiNumeralToInt("二〇二六"), 2026);
assert.equal(kanjiNumeralToInt("本"), null);

// 匹・杯は本と同じ音の変化
assert.equal(readNumberWithUnit(1, "匹"), "いっぴき");
assert.equal(readNumberWithUnit(3, "匹"), "さんびき");
assert.equal(readNumberWithUnit(6, "匹"), "ろっぴき");
assert.equal(readNumberWithUnit(4, "匹"), "よんひき");
assert.equal(readNumberWithUnit(3, "杯"), "さんばい");
assert.equal(readNumberWithUnit(1, "杯"), "いっぱい");
assert.equal(readNumberWithUnit(3, "本"), "さんぼん", "本は従来どおり");
assert.equal(readNumberWithUnit(20, "本"), "にじゅっぽん");
assert.equal(readNumberWithUnit(100, "本"), "ひゃっぽん");
assert.equal(readNumberWithUnit(1, "冊"), "いっさつ");
assert.equal(readNumberWithUnit(8, "冊"), "はっさつ");

// 表記から
assert.equal(readingForNumberWithCounter("三本"), "さんぼん");
assert.equal(readingForNumberWithCounter("一本"), "いっぽん");
assert.equal(readingForNumberWithCounter("六匹"), "ろっぴき");
assert.equal(readingForNumberWithCounter("6匹"), "ろっぴき");
// 文脈で読みが変わる・特別な読みの語は決めない（解析器と文脈の段に任せる）
for (const s of ["一日", "一月", "一時", "一分", "十分", "二十歳", "二十日", "一人", "二人", "一倍"]) {
  assert.equal(readingForNumberWithCounter(s), "", `${s} は決めない`);
}
assert.equal(readingForNumberWithCounter("本"), "");

// 形態素列: 1語になっている（kuromoji は 三本 を人名 みつもと と読む）
const single = applyNumberCounterReadings([
  { surface_form: "鉛筆", reading: "エンピツ" },
  { surface_form: "三本", reading: "ミツモト", pos: "名詞" }
]);
assert.equal(single[1].surface_form, "三本");
assert.equal(single[1].reading, "さんぼん");
assert.equal(single[0].reading, "エンピツ", "ほかの語はそのまま");

// 形態素列: 数詞と助数詞に分かれている → 1語にまとめる
const split = applyNumberCounterReadings([
  { surface_form: "猫", reading: "ネコ" },
  { surface_form: "が", reading: "ガ" },
  { surface_form: "六", reading: "ロク" },
  { surface_form: "匹", reading: "ヒキ" },
  { surface_form: "いる", reading: "イル" }
]);
assert.deepEqual(
  split.map((t) => t.surface_form),
  ["猫", "が", "六匹", "いる"]
);
assert.equal(split[2].reading, "ろっぴき");

// 文脈で決める語は触らない
const ambiguous = applyNumberCounterReadings([
  { surface_form: "一", reading: "イチ" },
  { surface_form: "日", reading: "ニチ" }
]);
assert.deepEqual(ambiguous.map((t) => t.surface_form), ["一", "日"]);
// 入力は変更しない
const input = [{ surface_form: "三本", reading: "ミツモト" }];
applyNumberCounterReadings(input);
assert.equal(input[0].reading, "ミツモト");

console.log("数詞＋助数詞のテスト: 問題なし");
