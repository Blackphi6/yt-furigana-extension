import assert from "node:assert/strict";
import {
  readCardinal,
  readNumberWithUnit,
  readingForNumberUnitSurface,
  readingForNumberSurface,
  readingForUnitAlone,
  applyNumberUnitReadings,
  matchNumberUnitTokenSpan,
  applyJuuSokuon,
  parseDotSeparatedDigits,
  readingForDotSeparatedDigits
} from "../src/number-unit-reading.js";
import { mergeTokensForRuby } from "../src/token-merge.js";
import { buildFuriganaHtml } from "../src/furigana.js";

assert.equal(readCardinal(0), "");
assert.equal(readCardinal(7), "なな");
assert.equal(readCardinal(7000), "ななせん");
assert.equal(readCardinal(10000), "いちまん");
assert.equal(readCardinal(12345), "いちまんにせんさんびゃくよんじゅうご");

assert.equal(readingForNumberUnitSurface("0時"), "れいじ");
assert.equal(readingForNumberUnitSurface("7時"), "しちじ");
assert.equal(readingForNumberUnitSurface("9時"), "くじ");
assert.equal(readingForNumberUnitSurface("4時"), "よじ");
assert.equal(readingForNumberUnitSurface("12時"), "じゅうにじ");

assert.equal(readingForNumberUnitSurface("7,000円"), "ななせんえん");
assert.equal(readingForNumberUnitSurface("７，０００円"), "ななせんえん");
assert.equal(readingForNumberUnitSurface("100円"), "ひゃくえん");
assert.equal(readingForNumberUnitSurface("0円"), "ぜろえん");

assert.equal(readingForNumberUnitSurface("1人"), "ひとり");
assert.equal(readingForNumberUnitSurface("2人"), "ふたり");
assert.equal(readingForNumberUnitSurface("4人"), "よにん");
assert.equal(readingForNumberUnitSurface("10人"), "じゅうにん");

assert.equal(readingForNumberUnitSurface("1月"), "いちがつ");
assert.equal(readingForNumberUnitSurface("4月"), "しがつ");
assert.equal(readingForNumberUnitSurface("9月"), "くがつ");
assert.equal(readingForNumberUnitSurface("4日"), "よっか");
assert.equal(readingForNumberUnitSurface("1日"), "ついたち");

assert.equal(readingForNumberUnitSurface("10分"), "じゅっぷん");
assert.equal(readingForNumberUnitSurface("1分"), "いっぷん");
assert.equal(readingForNumberUnitSurface("30分"), "さんじゅっぷん");

assert.equal(readNumberWithUnit(50, "%"), "ゴジュッパーセント");
assert.equal(readingForNumberUnitSurface("50%"), "ゴジュッパーセント");
assert.equal(readingForNumberUnitSurface("10%"), "ジュッパーセント");
assert.equal(readingForNumberUnitSurface("1%"), "イッパーセント");
assert.equal(readingForNumberUnitSurface("50点"), "ごじゅってん");
assert.equal(readingForNumberUnitSurface("10点"), "じゅってん");
assert.equal(readingForNumberUnitSurface("1点"), "いってん");
assert.equal(readingForNumberUnitSurface("210円"), "にひゃくじゅうえん");
assert.equal(readingForNumberSurface("1000"), "せん");
assert.equal(readingForNumberSurface("１,０００"), "せん");
assert.equal(readingForNumberSurface("１０００"), "せん");
assert.equal(readingForNumberSurface("10000"), "いちまん");
assert.equal(readingForNumberSurface("0"), "ぜろ");
assert.equal(readingForNumberSurface("12.8"), "じゅうにてんはち");
assert.equal(readingForNumberSurface("0.5"), "れいてんご");
assert.equal(readingForNumberSurface("3.14"), "さんてんいちよん");

assert.deepEqual(parseDotSeparatedDigits("3.2.1"), ["3", "2", "1"]);
assert.deepEqual(parseDotSeparatedDigits("3. 2. 1"), ["3", "2", "1"]);
assert.equal(parseDotSeparatedDigits("2.1"), null);
assert.equal(parseDotSeparatedDigits("3.14"), null);
assert.equal(readingForDotSeparatedDigits("3.2.1"), "スリーツーワン");
assert.equal(readingForDotSeparatedDigits("3. 2. 1"), "スリーツーワン");

const countdownTight = applyNumberUnitReadings([
  { surface_form: "3", reading: "" },
  { surface_form: ".", reading: "" },
  { surface_form: "2", reading: "" },
  { surface_form: ".", reading: "" },
  { surface_form: "1", reading: "" },
  { surface_form: "!", reading: "" }
]);
assert.equal(countdownTight[0].surface_form, "3.2.1");
assert.equal(countdownTight[0].reading, "スリーツーワン");
assert.equal(countdownTight[0].preserveKatakana, true);
assert.equal(countdownTight[1].surface_form, "!");

const countdownSpaced = applyNumberUnitReadings([
  { surface_form: "3", reading: "" },
  { surface_form: ".", reading: "" },
  { surface_form: " ", reading: "" },
  { surface_form: "2", reading: "" },
  { surface_form: ".", reading: "" },
  { surface_form: " ", reading: "" },
  { surface_form: "1", reading: "" },
  { surface_form: " ", reading: "" },
  { surface_form: "!", reading: "" }
]);
assert.equal(countdownSpaced[0].reading, "スリーツーワン");
assert.ok(countdownSpaced[0].surface_form.includes("3"));
assert.ok(countdownSpaced[0].surface_form.includes("2"));
assert.ok(countdownSpaced[0].surface_form.includes("1"));
// 小数 2.1 は従来どおり
const decimalTwoOne = applyNumberUnitReadings([
  { surface_form: "2", reading: "" },
  { surface_form: ".", reading: "" },
  { surface_form: "1", reading: "" }
]);
assert.equal(decimalTwoOne[0].surface_form, "2.1");
assert.equal(decimalTwoOne[0].reading, "にてんいち");

assert.equal(readingForNumberUnitSurface("12.8V"), "ジュウニテンハチボルト");
assert.equal(readingForNumberUnitSurface("12.8 V"), "ジュウニテンハチボルト");
assert.equal(readingForNumberUnitSurface("320Ah"), "サンビャクニジュウアンペアアワー");
assert.equal(readingForUnitAlone("Wh"), "ワットアワー");
assert.equal(readingForUnitAlone("V"), "ボルト");

const decimalTokens = applyNumberUnitReadings([
  { surface_form: "12", reading: "", pos: "名詞" },
  { surface_form: ".", reading: "", pos: "記号" },
  { surface_form: "8", reading: "", pos: "名詞" },
  { surface_form: " ", reading: "", pos: "記号" },
  { surface_form: "V", reading: "ボルト", pos: "名詞" }
]);
assert.equal(decimalTokens.length, 1);
assert.equal(decimalTokens[0].reading, "ジュウニテンハチボルト");

assert.equal(
  applyNumberUnitReadings([{ surface_form: "Wh", reading: "ダブリューエイチ", pos: "名詞" }])[0]
    .reading,
  "ワットアワー"
);

const thousandTokens = applyNumberUnitReadings([
  { surface_form: "１", reading: "イチ", pos: "名詞" },
  { surface_form: "０", reading: "ゼロ", pos: "名詞" },
  { surface_form: "０", reading: "ゼロ", pos: "名詞" },
  { surface_form: "０", reading: "ゼロ", pos: "名詞" }
]);
assert.equal(thousandTokens.length, 1);
assert.equal(thousandTokens[0].surface_form, "１０００");
assert.equal(thousandTokens[0].reading, "せん");

const asciiThousand = applyNumberUnitReadings([
  { surface_form: "1000", reading: "", pos: "名詞" }
]);
assert.equal(asciiThousand[0].reading, "せん");
assert.equal(readingForNumberUnitSurface("100W"), "ヒャクワット");
assert.equal(readingForNumberUnitSurface("1.5kW"), "イチテンゴキロワット");
assert.equal(readingForNumberUnitSurface("1500W"), "センゴヒャクワット");
assert.equal(readingForNumberUnitSurface("3km"), "サンキロメートル");
assert.equal(readingForNumberUnitSurface("50％"), "ゴジュッパーセント");
assert.equal(readingForNumberUnitSurface("50W"), "ゴジュウワット"); // ワ行は促音なし

assert.equal(applyJuuSokuon("ごじゅう", "パーセント"), "ごじゅっ");
assert.equal(applyJuuSokuon("にひゃくじゅう", "えん"), "にひゃくじゅう");

const wattTokens = applyNumberUnitReadings([
  { surface_form: "100", reading: "ヒャク", pos: "名詞" },
  { surface_form: "W", reading: "ダブリュー", pos: "名詞" }
]);
assert.equal(wattTokens.length, 1);
assert.equal(wattTokens[0].surface_form, "100W");
assert.equal(wattTokens[0].reading, "ヒャクワット");
assert.equal(wattTokens[0].preserveKatakana, true);

const splitYen = applyNumberUnitReadings([
  { surface_form: "7", reading: "ナナ" },
  { surface_form: ",", reading: "" },
  { surface_form: "000", reading: "ゼロゼロゼロ" },
  { surface_form: "円", reading: "エン" }
]);
assert.equal(splitYen.length, 1);
assert.equal(splitYen[0].surface_form, "7,000円");
assert.equal(splitYen[0].reading, "ななせんえん");

const span = matchNumberUnitTokenSpan(
  [
    { surface_form: "0" },
    { surface_form: "時" },
    { surface_form: "に" }
  ],
  0
);
assert.deepEqual(span, {
  end: 2,
  surface: "0時",
  reading: "れいじ",
  preserveKatakana: false
});

const merged = mergeTokensForRuby([
  { surface_form: "0", reading: "ゼロ", pos: "名詞" },
  { surface_form: "時", reading: "ジ", pos: "名詞" },
  { surface_form: "に", reading: "ニ", pos: "助詞" }
]);
assert.equal(merged[0].surface_form, "0時");
assert.equal(merged[0].reading, "れいじ");

const fakeTokenize = (text) => {
  // 簡易: 数字＋カンマ＋単位をバラして結合を検証
  if (text === "7,000円です") {
    return [
      { surface_form: "7", reading: "ナナ", pos: "名詞" },
      { surface_form: ",", reading: "", pos: "記号" },
      { surface_form: "000", reading: "", pos: "名詞" },
      { surface_form: "円", reading: "エン", pos: "名詞" },
      { surface_form: "です", reading: "デス", pos: "助動詞" }
    ];
  }
  if (text === "0時から") {
    return [
      { surface_form: "0", reading: "ゼロ", pos: "名詞" },
      { surface_form: "時", reading: "ジ", pos: "名詞" },
      { surface_form: "から", reading: "カラ", pos: "助詞" }
    ];
  }
  if (text === "1人の夜") {
    return [
      { surface_form: "1", reading: "イチ", pos: "名詞" },
      { surface_form: "人", reading: "ニン", pos: "名詞" },
      { surface_form: "の", reading: "ノ", pos: "助詞" },
      { surface_form: "夜", reading: "ヨル", pos: "名詞" }
    ];
  }
  return [{ surface_form: text, reading: "", pos: "名詞" }];
};

const yenHtml = buildFuriganaHtml("7,000円です", fakeTokenize);
assert.match(yenHtml, /data-reading="ななせんえん"/);
assert.match(yenHtml, /<ruby>7,000円<rt>ななせんえん<\/rt><\/ruby>/);

const timeHtml = buildFuriganaHtml("0時から", fakeTokenize);
assert.match(timeHtml, /data-reading="れいじ"/);
assert.match(timeHtml, /<ruby>0時<rt>れいじ<\/rt><\/ruby>/);

const hitoriHtml = buildFuriganaHtml("1人の夜", fakeTokenize);
assert.match(hitoriHtml, /<ruby>1人<rt>ひとり<\/rt><\/ruby>/);

console.log("number-unit-reading tests passed.");
