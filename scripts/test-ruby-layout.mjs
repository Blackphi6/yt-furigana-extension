import assert from "node:assert/strict";
import {
  MAX_RT_TIGHTEN_EM,
  MIN_CAPTION_SCALE,
  RUBY_BASE_OVERFLOW_EM,
  RUBY_RT_CLEARANCE_PX,
  computeRubyFit,
  computeRubyNeighborGapPx,
  computeRubyPadTopPx,
  computeRubyRtFontScale,
  computeRubySeparatePushPx,
  computeLineShrinkScale
} from "../src/ruby-layout.js";

assert.equal(MAX_RT_TIGHTEN_EM, 0);
assert.equal(computeRubyRtFontScale(4, 1), 1);
assert.ok(RUBY_RT_CLEARANCE_PX >= 2);

assert.deepEqual(
  computeRubyFit({
    rubyWidth: 40,
    rtNaturalWidth: 100,
    rtLength: 4,
    baseLength: 1,
    rtFontSizePx: 10
  }),
  {
    rtLetterSpacingPx: 0,
    baseLetterSpacingPx: 0,
    paddingInlinePx: 0,
    minWidthPx: null,
    rtScaleX: 1
  }
);

assert.ok(computeRubyNeighborGapPx(4, 1, 12) >= 1);
assert.equal(computeLineShrinkScale(100, 120), 1);
assert.equal(computeLineShrinkScale(200, 100), MIN_CAPTION_SCALE);

// 別行は押し広げない（長文折り返し崩壊防止）
assert.equal(
  computeRubySeparatePushPx({
    leftTop: 10,
    rightTop: 50,
    leftHeight: 12,
    rightHeight: 12,
    gapPx: -200,
    minGapPx: 1,
    maxPushPx: 6
  }),
  0
);

// 同一行の軽い重なりは上限付き
{
  const push = computeRubySeparatePushPx({
    leftTop: 10,
    rightTop: 11,
    leftHeight: 12,
    rightHeight: 12,
    gapPx: -20,
    minGapPx: 1,
    maxPushPx: 6
  });
  assert.ok(push > 0);
  assert.ok(push <= 6);
}

{
  const pad = computeRubyPadTopPx({
    rtHeightPx: 10,
    rtFontSizePx: 10,
    baseFontSizePx: 20
  });
  // rt 10 + clearance + 漢字はみ出し
  assert.ok(pad >= 10 + RUBY_RT_CLEARANCE_PX + Math.ceil(20 * RUBY_BASE_OVERFLOW_EM));
  assert.ok(pad > 10 + 2, "must be looser than the old rtHeight+2 padding");
}

console.log("Ruby layout tests passed.");
