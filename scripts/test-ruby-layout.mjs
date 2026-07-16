import assert from "node:assert/strict";
import {
  MAX_RT_TIGHTEN_EM,
  MIN_CAPTION_SCALE,
  computeRubyFit,
  computeLineShrinkScale
} from "../src/ruby-layout.js";

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
    minWidthPx: null,
    rtScaleX: 1
  }
);

// 余白: 圧縮なし・読み幅まで本文を広げる（隣接衝突防止）
{
  const fit = computeRubyFit({
    rubyWidth: 40,
    rtNaturalWidth: 100,
    rtLength: 3,
    baseLength: 1,
    rtFontSizePx: 10
  });
  assert.equal(fit.rtScaleX, 1);
  assert.equal(fit.baseLetterSpacingPx, 0);
  assert.ok(fit.paddingInlinePx > 0);
  assert.ok(fit.minWidthPx >= 98);
  assert.ok(fit.minWidthPx <= 100);
}

// 極端に長い読みもほぼ全幅分の余白（上限キャップなし）
{
  const fit = computeRubyFit({
    rubyWidth: 40,
    rtNaturalWidth: 200,
    rtLength: 13,
    baseLength: 3,
    rtFontSizePx: 10
  });
  assert.equal(fit.rtScaleX, 1);
  assert.ok(fit.minWidthPx >= 190);
  assert.ok(fit.paddingInlinePx * 2 >= 140);
}

// 1行維持: はみ出し分だけ全体スケール（下限あり）
assert.equal(computeLineShrinkScale(100, 120), 1);
assert.equal(computeLineShrinkScale(200, 100), MIN_CAPTION_SCALE);
assert.ok(
  Math.abs(computeLineShrinkScale(120, 100) - (100 / 120) * 0.985) < 1e-9
);

// 詰めのみ
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
  assert.equal(fit.paddingInlinePx, 0);
}

console.log("Ruby layout tests passed.");
