import assert from "node:assert/strict";
import {
  applyKanjiReadings,
  installKanjiReadingsForTests,
  lookupKanjiDefaultReading,
  lookupKanjiReadingCandidates
} from "../src/kanji-readings.js";
import { buildFuriganaHtml } from "../src/furigana.js";

installKanjiReadingsForTests({
  龍: { default: "りゅう", readings: ["りゅう", "たつ"] },
  鬱: { default: "うつ", readings: ["うつ"] }
});

assert.equal(lookupKanjiDefaultReading("龍"), "りゅう");
assert.deepEqual(lookupKanjiReadingCandidates("龍"), ["りゅう", "たつ"]);

const filled = applyKanjiReadings([
  { surface_form: "龍", reading: "" },
  { surface_form: "東京", reading: "" },
  { surface_form: "空", reading: "そら" }
]);
assert.equal(filled[0].reading, "りゅう");
assert.equal(filled[0]._kanjiReading, true);
assert.equal(filled[1].reading, ""); // 2文字は触らない
assert.equal(filled[2].reading, "そら"); // 既存は維持

const html = buildFuriganaHtml("龍", () => [{ surface_form: "龍", reading: "" }]);
assert.ok(html.includes("<rt>りゅう</rt>"), html);

console.log("test-kanji-readings: ok");
