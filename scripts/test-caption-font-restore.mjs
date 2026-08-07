/**
 * OFF 時の font-size 復元（親11px継承で極小になる問題の回帰防止）。
 */
import assert from "node:assert/strict";
import {
  applyReleasedFontSize,
  restoreCaptionFontSizeAfterRelease,
  extractFontSizeFromStyleAttr,
  restoreYouTubeCaptionAppearance,
  ensureReleasedCaptionsReadable
} from "../src/caption-styles.js";

class FakeEl {
  constructor(opts = {}) {
    this._attrs = {};
    this.classList = {
      contains: (c) => Boolean(opts.className?.split(/\s+/).includes(c))
    };
    this.style = {
      _p: {},
      _prio: {},
      setProperty(k, v, prio) {
        this._p[k] = String(v);
        if (prio) this._prio[k] = prio;
        else delete this._prio[k];
      },
      removeProperty(k) {
        delete this._p[k];
        delete this._prio[k];
      },
      getPropertyValue(k) {
        return this._p[k] || "";
      },
      getPropertyPriority(k) {
        return this._prio[k] || "";
      }
    };
  }
  getAttribute(name) {
    return this._attrs[name] ?? null;
  }
  setAttribute(name, value) {
    this._attrs[name] = String(value);
    if (name === "style") {
      this.style._p = {};
      this.style._prio = {};
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
    delete this._attrs[name];
    if (name === "style") {
      this.style._p = {};
      this.style._prio = {};
    }
  }
  closest() {
    return null;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
}

globalThis.HTMLElement = FakeEl;
globalThis.getComputedStyle = (el) => ({
  fontSize: el.style.getPropertyValue("font-size") || "11px",
  color: "rgb(255, 255, 255)",
  backgroundColor: "rgba(8, 8, 8, 0.75)",
  textShadow: "none",
  webkitTextStrokeWidth: "0px"
});

{
  // DevTools再現: prior inline 空 + locked 31.55px → 31.55 に戻す
  const el = new FakeEl();
  restoreCaptionFontSizeAfterRelease(el, {
    priorInlineFontSize: "",
    lockedFontSize: "31.5556px"
  });
  assert.equal(el.style.getPropertyValue("font-size"), "31.5556px");
}

{
  // prior があればそれを優先
  const el = new FakeEl();
  restoreCaptionFontSizeAfterRelease(el, {
    priorInlineFontSize: "28px",
    priorInlineFontPriority: "",
    lockedFontSize: "31.5556px"
  });
  assert.equal(el.style.getPropertyValue("font-size"), "28px");
}

{
  // 旧 API 互換
  const el = new FakeEl();
  el.style.setProperty("font-size", "14px", "important");
  applyReleasedFontSize(el, "28px", "");
  assert.equal(el.style.getPropertyValue("font-size"), "28px");
}

assert.equal(
  extractFontSizeFromStyleAttr(
    "display: inline-block; font-size: 28px; color: #fff"
  ),
  "28px"
);
assert.equal(extractFontSizeFromStyleAttr("color: red"), "");

{
  // prior に font-size 無し + locked → 復元後に locked が入る
  const el = new FakeEl();
  el.setAttribute(
    "data-yt-furigana-prior-style",
    "display: inline-block; white-space: pre-wrap; background: rgba(8, 8, 8, 0.75); color: rgb(255, 255, 255)"
  );
  el.style.setProperty("font-size", "11px", "important");
  restoreYouTubeCaptionAppearance(el, { lockedFontSize: "28px" });
  assert.equal(el.style.getPropertyValue("font-size"), "28px");
}

{
  // ensureReleasedCaptionsReadable: 11px を直す
  const el = new FakeEl();
  el.style.setProperty("font-size", "11px");
  const root = {
    querySelectorAll: () => [el]
  };
  ensureReleasedCaptionsReadable(root);
  assert.ok(parseFloat(el.style.getPropertyValue("font-size")) >= 14);
}

console.log("test-caption-font-restore: ok");
