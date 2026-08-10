import assert from "node:assert/strict";
import {
  applyKanjiReadings,
  installKanjiReadings,
  lookupKanjiSurfaceReading,
} from "../site/demo-kanji-readings.js";
import { fillUncoveredTokenGaps } from "../site/demo-occurrence-overrides.js";

installKanjiReadings({
  落: { default: "らく", readings: ["らく", "さと"] },
  一: { default: "いち", readings: ["いち"] },
  段: { default: "だん", readings: ["だん"] },
});

assert.equal(lookupKanjiSurfaceReading("落"), "らく");
assert.equal(lookupKanjiSurfaceReading("一段"), "いちだん");

const text = "一段落";
const sparse = [
  { surface: "一段", span: [0, 2], reading: "いちだん", source: "unidic" },
];
const gaps = fillUncoveredTokenGaps(text, sparse, { kanjiOnly: true });
const filled = applyKanjiReadings(gaps);
const ochi = filled.find((t) => t.surface === "落");
assert.ok(ochi);
assert.equal(ochi.reading, "らく");
assert.equal(ochi.source, "kanji");

console.log("test-demo-kanji-readings: ok");
