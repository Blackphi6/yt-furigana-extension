/**
 * site/number-overlay.js — 数字をルビ修正UIに載せる
 */
import assert from "node:assert/strict";
import {
  collectNumberTokens,
  overlayNumberTokens,
  readingForDigitRun,
  digitByDigitReading,
  rebuildFullReading,
} from "../site/number-overlay.js";
import { isRegisterableSurface, isNumberReadingTipSurface } from "../site/build-ruby.js";
import { isQuizToken, collectQuizItems } from "../site/demo-quiz.js";

{
  const p = readingForDigitRun("21");
  assert.equal(p?.reading, "にじゅういち");
  assert.equal(digitByDigitReading("21", "hira"), "にいち");
  assert.equal(digitByDigitReading("21", "kata"), "ニーイチ");
}

{
  const text = "21階にバーテンダーがいるよ";
  const nums = collectNumberTokens(text);
  assert.equal(nums.length, 1);
  assert.equal(nums[0].surface, "21");
  assert.equal(nums[0].reading, "にじゅういち");
  assert.ok(nums[0].candidates.includes("にいち"));
  assert.ok(nums[0].candidates.includes("ニーイチ"));
}

{
  const text = "21階にバーテンダーがいるよ";
  const apiTokens = [
    {
      surface: "階",
      span: [2, 3],
      reading: "かい",
      confidence: 0.55,
      source: "base_engine",
      candidates: ["かい", "きざはし"],
    },
  ];
  const merged = overlayNumberTokens(text, apiTokens);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].surface, "21");
  assert.equal(merged[1].surface, "階");
  const full = rebuildFullReading(text, merged);
  assert.ok(full.startsWith("にじゅういちかい"), full);
  assert.ok(!full.startsWith("21"), full);
}

{
  assert.equal(isRegisterableSurface("21"), true);
  assert.equal(isRegisterableSurface("階"), true);
  assert.equal(isNumberReadingTipSurface("21"), true);
  assert.equal(isNumberReadingTipSurface("階"), false);
}

{
  const token = {
    surface: "21",
    reading: "にじゅういち",
    confidence: 0.9,
    source: "number_rule",
    candidates: ["にじゅういち", "にいち", "ニーイチ"],
  };
  assert.ok(isQuizToken(token), "number with 2+ cands is quiz");
  const items = collectQuizItems("21階", [
    token,
    {
      surface: "階",
      span: [2, 3],
      reading: "かい",
      confidence: 0.55,
      source: "base_engine",
      candidates: ["かい", "きざはし"],
    },
  ]);
  assert.ok(items.some((it) => it.surface === "21"), "quiz includes 21");
}

console.log("test-number-overlay: ok");
