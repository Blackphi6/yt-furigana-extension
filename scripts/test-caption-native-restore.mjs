/**
 * 壊れた字幕 style の検出とネイティブ寄り復元。
 */
import assert from "node:assert/strict";
import { isCorruptCaptionInlineStyle } from "../src/caption-teardown.js";
import {
  applyYouTubeSegmentStyleFallback,
  looksLikeBrokenCaptionComputed,
  restoreYouTubeCaptionAppearance
} from "../src/caption-styles.js";

assert.equal(isCorruptCaptionInlineStyle("font-size: 31.5556px;"), true);
assert.equal(isCorruptCaptionInlineStyle("font-size: 31px"), true);
assert.equal(
  isCorruptCaptionInlineStyle(
    "display: inline-block; background: rgba(8, 8, 8, 0.75); font-size: 31px; color: rgb(255, 255, 255);"
  ),
  false
);
assert.equal(isCorruptCaptionInlineStyle(""), false);
assert.equal(isCorruptCaptionInlineStyle(null), false);

class FakeEl {
  constructor() {
    this.attrs = new Map();
    this.style = {
      _p: {},
      setProperty(k, v) {
        this._p[k] = String(v);
      },
      removeProperty(k) {
        delete this._p[k];
      },
      getPropertyValue(k) {
        return this._p[k] || "";
      },
      getPropertyPriority() {
        return "";
      }
    };
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === "style") {
      this.style._p = {};
      for (const part of String(value).split(";")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) this.style._p[k] = v;
      }
    }
  }
  removeAttribute(name) {
    this.attrs.delete(name);
    if (name === "style") this.style._p = {};
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
}

globalThis.HTMLElement = FakeEl;

{
  const el = new FakeEl();
  el.setAttribute("style", "font-size: 31.5556px;");
  // computed 黒＋透過を模倣
  globalThis.getComputedStyle = () => ({
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "rgb(0, 0, 0)",
    fontSize: "31.5556px"
  });
  assert.equal(looksLikeBrokenCaptionComputed(el), true);

  el.setAttribute(
    "data-yt-furigana-prior-style",
    "display: inline-block; white-space: pre-wrap; background: rgba(8, 8, 8, 0.75); font-size: 31.5556px; color: rgb(255, 255, 255);"
  );
  restoreYouTubeCaptionAppearance(el, {
    priorInlineStyle: "font-size: 31.5556px;",
    lockedFontSize: "31.5556px"
  });
  const style = el.getAttribute("style") || "";
  assert.match(style, /background/);
  assert.match(style, /255,\s*255,\s*255/);
}

{
  const el = new FakeEl();
  applyYouTubeSegmentStyleFallback(el, "28px");
  assert.match(el.getAttribute("style") || "", /28px/);
  assert.match(el.getAttribute("style") || "", /rgba\(8, 8, 8, 0\.75\)/);
}

console.log("test-caption-native-restore: ok");
