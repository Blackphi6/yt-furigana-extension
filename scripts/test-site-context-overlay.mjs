/**
 * サイトデモの文脈補正（公の場→おおやけ など）
 */
import assert from "node:assert/strict";
import {
  applyDemoContextReadings,
  DEMO_MANUAL_PHRASES
} from "../site/context-reading-overlay.js";

const text = "公の場で私的な感情を露わにするべきではない。";
const tokens = applyDemoContextReadings(text, [
  {
    surface: "公",
    span: [0, 1],
    reading: "こう",
    confidence: 0.6,
    candidates: ["こう"]
  },
  {
    surface: "場",
    span: [2, 3],
    reading: "ば",
    confidence: 0.9,
    candidates: ["ば"]
  }
]);
assert.equal(tokens[0].reading, "おおやけ");
assert.equal(tokens[0].source, "demo_context");
assert.equal(DEMO_MANUAL_PHRASES["七五三"], "しちごさん");
assert.equal(DEMO_MANUAL_PHRASES["揚子江"], "ようすこう");

console.log("test-site-context-overlay: ok");
