import assert from "node:assert/strict";
import {
  hasVisibleBackground,
  parseBackgroundAlpha,
  resolveCaptionBackgroundColor
} from "../src/caption-styles.js";

assert.equal(parseBackgroundAlpha("transparent"), 0);
assert.equal(parseBackgroundAlpha("rgba(0, 0, 0, 0)"), 0);
assert.equal(parseBackgroundAlpha("rgba(8, 8, 8, 0.75)"), 0.75);
assert.equal(hasVisibleBackground("rgba(8, 8, 8, 0)"), false);
assert.equal(hasVisibleBackground("rgba(8, 8, 8, 0.75)"), true);

// jsdom 無しでも null で落ちない
assert.equal(resolveCaptionBackgroundColor(null), null);

console.log("Caption background tests passed.");
