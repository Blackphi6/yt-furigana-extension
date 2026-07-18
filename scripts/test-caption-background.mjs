import assert from "node:assert/strict";
import {
  hasVisibleBackground,
  parseBackgroundAlpha,
  resolveCaptionBackgroundColor,
  ensureTVerCaptionOverflow,
  liftTVerRubyCaption,
  expandYouTubeCaptionWindow,
  computeTVerLineGapPx,
  computeTVerViewportLiftPx,
  scheduleTVerCaptionFit,
  scheduleYouTubeCaptionFit,
  scheduleCaptionViewportFit,
  fitTVerCaptionViewport,
  isOutlineOnlyCaption
} from "../src/caption-styles.js";

assert.equal(parseBackgroundAlpha("transparent"), 0);
assert.equal(parseBackgroundAlpha("rgba(0, 0, 0, 0)"), 0);
assert.equal(parseBackgroundAlpha("rgba(8, 8, 8, 0.75)"), 0.75);
assert.equal(hasVisibleBackground("rgba(8, 8, 8, 0)"), false);
assert.equal(hasVisibleBackground("rgba(8, 8, 8, 0.75)"), true);

assert.equal(resolveCaptionBackgroundColor(null), null);
assert.equal(ensureTVerCaptionOverflow(null), undefined);
assert.equal(liftTVerRubyCaption(null), undefined);
assert.equal(expandYouTubeCaptionWindow(null), undefined);
assert.equal(scheduleTVerCaptionFit(null), undefined);
assert.equal(scheduleYouTubeCaptionFit(null), undefined);
assert.equal(scheduleCaptionViewportFit(null), undefined);
assert.equal(fitTVerCaptionViewport(null), undefined);
assert.equal(isOutlineOnlyCaption(null), false);

assert.equal(computeTVerLineGapPx(0), 10);
assert.equal(computeTVerLineGapPx(20), 28);

assert.equal(
  computeTVerViewportLiftPx({
    stackTop: 100,
    stackBottom: 520,
    safeTop: 40,
    safeBottom: 500
  }),
  20
);

console.log("Caption background tests passed.");
