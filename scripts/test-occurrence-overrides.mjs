/**
 * 拡張の出現上書き（大人気 など結合読み）
 */
import assert from "node:assert/strict";
import {
  applyOccurrenceOverrides,
  assignTokenSpans,
  countSurfaceOccurrences,
  expandOverrideSpan,
  fillUncoveredTokenGaps,
  installOccurrenceOverridesForTests,
  shouldPinGlobally,
  spanFromTokenRange,
  upsertOccurrenceOverride,
} from "../src/occurrence-overrides.js";

{
  const text = "大人気のない大人が、大人気のアニメグッズを大人買いした。";
  let tokens = [
    { surface_form: "大", reading: "ダイ" },
    { surface_form: "人気", reading: "ニンキ" },
    { surface_form: "の", reading: "ノ" },
    { surface_form: "ない", reading: "ナイ" },
    { surface_form: "大人", reading: "オトナ" },
  ];
  tokens = assignTokenSpans(tokens, text);
  assert.deepEqual(tokens[0].span, [0, 1]);
  assert.deepEqual(tokens[1].span, [1, 3]);
  const merged = spanFromTokenRange(text, tokens, 0, 1);
  assert.equal(merged.surface, "大人気");
  assert.deepEqual([merged.start, merged.end], [0, 3]);

  const overrides = upsertOccurrenceOverride([], {
    start: 0,
    end: 3,
    surface: "大人気",
    reading: "おとなげ",
  });
  installOccurrenceOverridesForTests({ [text]: overrides });
  const out = applyOccurrenceOverrides(text, tokens, overrides);
  assert.equal(out[0].surface_form || out[0].surface, "大人気");
  assert.equal(out[0].reading, "おとなげ");
  assert.equal(out[0].source, "occurrence");
  assert.equal(shouldPinGlobally(text, "大人気"), false);
  assert.equal(countSurfaceOccurrences(text, "大人気"), 2);
}

{
  const expanded = expandOverrideSpan("一日中", 0, 1, "一", "いちにち");
  assert.deepEqual(expanded, {
    start: 0,
    end: 2,
    surface: "一日",
    reading: "いちにち",
  });
}

// 金星だけ残して見上げ／挙げるが欠けても unset で埋まる（漢字は1字ずつ）
{
  const text = "金星を見上げ、金星を挙げる。";
  const sparse = [
    { surface: "金星", span: [0, 2], reading: "すたー", source: "occurrence" },
    { surface: "金星", span: [7, 9], reading: "きんぼし", source: "occurrence" },
  ];
  const filled = fillUncoveredTokenGaps(text, sparse);
  const unset = filled.filter((t) => t.source === "unset");
  assert.equal(unset.length, 3);
  assert.equal(unset[0].surface, "見");
  assert.deepEqual(unset[0].span, [3, 4]);
  assert.equal(unset[0].reading, "");
  assert.equal(unset[1].surface, "上");
  assert.deepEqual(unset[1].span, [4, 5]);
  assert.equal(unset[2].surface, "挙");
  assert.deepEqual(unset[2].span, [10, 11]);

  // span 欠落トークンは先頭上書きに巻き込まれない
  const withMissing = applyOccurrenceOverrides(
    text,
    [
      { surface: "見上げ", reading: "みあげ" }, // span なし
      { surface: "金星", span: [0, 2], reading: "きんぼし" },
    ],
    [{ start: 0, end: 2, surface: "金星", reading: "すたー" }]
  );
  assert.ok(
    withMissing.some((t) => (t.surface || t.surface_form) === "見上げ"),
    "span 欠落の見上げが消えないこと"
  );
}

console.log("test-occurrence-overrides: ok");
