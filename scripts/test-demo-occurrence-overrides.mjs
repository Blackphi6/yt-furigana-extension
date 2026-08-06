/**
 * 同一文の同表層を出現ごとに別読みへ直せるか。
 */
import assert from "node:assert/strict";
import {
  applyOccurrenceOverrides,
  countSurfaceOccurrences,
  expandOverrideSpan,
  shouldPinGlobally,
  upsertOccurrenceOverride,
} from "../site/demo-occurrence-overrides.js";

const text = "一日中粘ったが、結局一日には間に合わなかった。";

assert.equal(countSurfaceOccurrences(text, "一日"), 2);
assert.equal(shouldPinGlobally(text, "一日"), false);
assert.equal(shouldPinGlobally("一日中だけ。", "一日"), true);

{
  const expanded = expandOverrideSpan(text, 0, 1, "一", "いちにち");
  assert.deepEqual(expanded, {
    start: 0,
    end: 2,
    surface: "一日",
    reading: "いちにち",
  });
}

{
  const second = text.indexOf("一日", 1);
  assert.equal(text.slice(second, second + 2), "一日");
  const overrides = [
    { start: 0, end: 2, surface: "一日", reading: "いちにち" },
    { start: second, end: second + 2, surface: "一日", reading: "ついたち" },
  ];

  const tokens = [
    {
      surface: "一日",
      span: [0, 2],
      reading: "ついたち",
      source: "user_dict",
      confidence: 1,
      candidates: ["ついたち"],
    },
    {
      surface: "一日",
      span: [second, second + 2],
      reading: "ついたち",
      source: "user_dict",
      confidence: 1,
      candidates: ["ついたち"],
    },
  ];
  const out = applyOccurrenceOverrides(text, tokens, overrides);
  assert.equal(out.length, 2);
  assert.equal(out[0].reading, "いちにち");
  assert.equal(out[1].reading, "ついたち");
}

// 角×4: 1箇所だけ「つの」に直しても他は元の読みのまま
{
  const kadoText = "角の角を曲がると、角の生えた牛が角に追い詰められていた。";
  assert.equal(countSurfaceOccurrences(kadoText, "角"), 4);
  assert.equal(shouldPinGlobally(kadoText, "角"), false);

  const spans = [];
  let from = 0;
  while (from < kadoText.length) {
    const i = kadoText.indexOf("角", from);
    if (i < 0) break;
    spans.push([i, i + 1]);
    from = i + 1;
  }
  assert.equal(spans.length, 4);

  const tokens = spans.map(([a, b]) => ({
    surface: "角",
    span: [a, b],
    reading: "かど",
    source: "user_dict",
    confidence: 1,
    candidates: ["かど", "つの"],
  }));

  // 3つ目（角の生えた）だけつのへ
  const horn = spans[2];
  const overrides = upsertOccurrenceOverride([], {
    start: horn[0],
    end: horn[1],
    surface: "角",
    reading: "つの",
  });
  const out = applyOccurrenceOverrides(kadoText, tokens, overrides);
  assert.equal(out.length, 4);
  assert.equal(out[0].reading, "かど");
  assert.equal(out[1].reading, "かど");
  assert.equal(out[2].reading, "つの");
  assert.equal(out[2].source, "occurrence");
  assert.equal(out[3].reading, "かど");
}

console.log("test-demo-occurrence-overrides: ok");
