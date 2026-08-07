/**
 * 拡張の出現上書き（大人気 など結合読み）
 */
import assert from "node:assert/strict";
import {
  applyOccurrenceOverrides,
  assignTokenSpans,
  countSurfaceOccurrences,
  expandOverrideSpan,
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

console.log("test-occurrence-overrides: ok");
