import assert from "node:assert/strict";
import {
  MAX_RT_TIGHTEN_EM,
  computeRubyFit
} from "../src/ruby-layout.js";

// 収まっている → 何もしない
assert.deepEqual(
  computeRubyFit({
    rubyWidth: 100,
    rtNaturalWidth: 80,
    rtLength: 4,
    baseLength: 2,
    rtFontSizePx: 10
  }),
  {
    rtLetterSpacingPx: 0,
    baseLetterSpacingPx: 0,
    paddingInlinePx: 0,
    minWidthPx: null
  }
);

// 少しはみ出し → 字間詰めだけで収まる（下限に達しない）
{
  const fit = computeRubyFit({
    rubyWidth: 105,
    rtNaturalWidth: 108,
    rtLength: 5,
    baseLength: 2,
    rtFontSizePx: 10
  });
  assert.ok(fit.rtLetterSpacingPx < 0);
  assert.ok(fit.rtLetterSpacingPx > MAX_RT_TIGHTEN_EM * 10);
  assert.equal(fit.minWidthPx, null);
  assert.equal(fit.baseLetterSpacingPx, 0);
}

// 大きくはみ出し → 詰め下限 + 漢字字間を広げる
{
  const fit = computeRubyFit({
    rubyWidth: 100,
    rtNaturalWidth: 220,
    rtLength: 9,
    baseLength: 4,
    rtFontSizePx: 10
  });
  assert.ok(Math.abs(fit.rtLetterSpacingPx - MAX_RT_TIGHTEN_EM * 10) < 1e-9);
  assert.ok(fit.minWidthPx > 100);
  assert.ok(fit.baseLetterSpacingPx > 0);
  assert.equal(fit.paddingInlinePx, 0);
}

// 漢字1文字 → padding で広げる
{
  const fit = computeRubyFit({
    rubyWidth: 40,
    rtNaturalWidth: 100,
    rtLength: 4,
    baseLength: 1,
    rtFontSizePx: 10
  });
  assert.ok(fit.paddingInlinePx > 0);
  assert.equal(fit.baseLetterSpacingPx, 0);
}

console.log("Ruby layout tests passed.");
