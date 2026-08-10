import assert from "node:assert/strict";
import {
  applyKanjiReadings,
  installKanjiReadingsForTests,
  lookupKanjiDefaultReading,
  lookupKanjiReadingCandidates,
  lookupKanjiSurfaceReading
} from "../src/kanji-readings.js";
import { fillUncoveredTokenGaps } from "../src/occurrence-overrides.js";
import { buildFuriganaHtml } from "../src/furigana.js";

installKanjiReadingsForTests({
  龍: { default: "りゅう", readings: ["りゅう", "たつ"] },
  鬱: { default: "うつ", readings: ["うつ"] },
  落: { default: "らく", readings: ["らく", "さと", "おちる"] },
  見: { default: "み", readings: ["み", "けん"] },
  上: { default: "じょう", readings: ["じょう", "うえ"] }
});

assert.equal(lookupKanjiDefaultReading("龍"), "りゅう");
assert.deepEqual(lookupKanjiReadingCandidates("龍"), ["りゅう", "たつ"]);
assert.equal(lookupKanjiSurfaceReading("龍"), "りゅう");
assert.equal(lookupKanjiSurfaceReading("見上"), "みじょう");

const filled = applyKanjiReadings([
  { surface_form: "龍", reading: "" },
  { surface_form: "東京", reading: "" },
  { surface_form: "空", reading: "そら" },
  { surface_form: "見上", reading: "" }
]);
assert.equal(filled[0].reading, "りゅう");
assert.equal(filled[0]._kanjiReading, true);
assert.equal(filled[1].reading, ""); // 辞書に無い複漢字は触らない
assert.equal(filled[2].reading, "そら"); // 既存は維持
assert.equal(filled[3].reading, "みじょう"); // 漢字のみは連結

const html = buildFuriganaHtml("龍", () => [{ surface_form: "龍", reading: "" }]);
assert.ok(html.includes("<rt>りゅう</rt>"), html);

// ギャップ埋め後も単漢字フォールバックが載る（一段＋落の切れ端）
{
  const text = "一段落";
  const sparse = [
    { surface: "一段", surface_form: "一段", span: [0, 2], reading: "いちだん" }
  ];
  const gaps = fillUncoveredTokenGaps(text, sparse);
  const withKanji = applyKanjiReadings(gaps);
  const ochi = withKanji.find((t) => (t.surface || t.surface_form) === "落");
  assert.ok(ochi, "落がギャップ埋めされる");
  assert.equal(ochi.reading, "らく");
  // 単漢字だけの入力でも読み無しにしない
  const html2 = buildFuriganaHtml("落", () => [
    { surface_form: "落", reading: "" }
  ]);
  assert.match(html2, /data-surface="落" data-reading="らく"/);
}

console.log("test-kanji-readings: ok");
