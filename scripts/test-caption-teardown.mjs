/**
 * Tests for caption teardown / OFF restore helpers (no jsdom).
 */
import assert from "node:assert/strict";
import {
  ORIGINAL_ATTR,
  PROCESSED_ATTR,
  normalizeCaptionPlain,
  plainTextWithoutRuby,
  prepareCaptionForLineFitCapture,
  flattenCaptionToPlainText,
  clearExtensionCaptionAttrs,
  rememberCaptionWindowStyle,
  restoreCaptionWindowStyle,
  clearYouTubeCaptionWindowArtifacts,
  hasExtensionCaptionMarkup,
  isCaptionExtensionStale
} from "../src/caption-teardown.js";
import {
  markKeepOneLineCaption,
  KEEP_ONE_LINE_ATTR,
  MIN_KEEP_ONE_LINE_SCALE
} from "../src/ruby-layout.js";

class FakeEl {
  constructor(className = "ytp-caption-segment") {
    this.className = className;
    this.attrs = new Map();
    const el = this;
    this.style = {
      _p: {},
      setProperty(k, v) {
        this._p[k] = String(v);
        el._syncStyleAttr();
      },
      removeProperty(k) {
        delete this._p[k];
        el._syncStyleAttr();
      }
    };
    /** @type {{ kind: string, text: string, style?: FakeEl['style'] }[]} */
    this.parts = [];
  }
  _syncStyleAttr() {
    const parts = Object.entries(this.style._p).map(([k, v]) => `${k}: ${v}`);
    if (parts.length) this.attrs.set("style", parts.join("; "));
    else this.attrs.delete("style");
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
  matches(sel) {
    return (
      String(sel).includes("ytp-caption-segment") &&
      this.className.includes("ytp-caption-segment")
    );
  }
  closest(sel) {
    return this.matches(sel) ? this : null;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const s = String(sel);
    const out = [];
    for (const part of this.parts) {
      const hit =
        (s.includes("rt") && part.kind === "rt") ||
        (s.includes("ruby") && part.kind === "ruby") ||
        (s.includes("one-line") && part.kind === "one-line") ||
        (s.includes("float") && part.kind === "float");
      if (!hit) continue;
      const node = {
        kind: part.kind,
        text: part.text,
        style: part.style || this.style,
        remove: () => {
          this.parts = this.parts.filter((p) => p !== part);
        }
      };
      out.push(node);
    }
    return out;
  }
  cloneNode() {
    const c = new FakeEl(this.className);
    c.parts = this.parts.map((p) => ({ ...p }));
    c.attrs = new Map(this.attrs);
    c.style._p = { ...this.style._p };
    return c;
  }
  get textContent() {
    return this.parts.map((p) => p.text).join("");
  }
  set textContent(value) {
    this.parts = [{ kind: "text", text: String(value ?? "") }];
  }
}

globalThis.HTMLElement = FakeEl;

assert.ok(MIN_KEEP_ONE_LINE_SCALE >= 0.7);
assert.equal(normalizeCaptionPlain("  a\u200b  b  "), "a b");

{
  // overflow だけ剥がし、YouTube の left/width は残す
  const el = new FakeEl();
  el.setAttribute("style", "left: 40%; width: 50%; overflow: visible");
  rememberCaptionWindowStyle(el);
  assert.equal(restoreCaptionWindowStyle(el), true);
  assert.match(el.getAttribute("style") || "", /left:\s*40%/);
  assert.match(el.getAttribute("style") || "", /width:\s*50%/);
  assert.doesNotMatch(el.getAttribute("style") || "", /overflow/);
  assert.equal(restoreCaptionWindowStyle(el), false);
}

{
  // 2セグメント teardown: left を剥がさない
  const win = new FakeEl("caption-window");
  win.setAttribute(
    "style",
    "left: 22%; width: 56%; transform: translateX(-50%); overflow: visible"
  );
  rememberCaptionWindowStyle(win);

  const seg1 = new FakeEl();
  const seg2 = new FakeEl();
  seg1.closest = () => win;
  seg2.closest = () => win;
  win.querySelectorAll = () => [];

  clearYouTubeCaptionWindowArtifacts(seg1);
  clearYouTubeCaptionWindowArtifacts(seg2);
  assert.match(win.getAttribute("style") || "", /left:\s*22%/);
  assert.equal(restoreCaptionWindowStyle(win), true);
  assert.match(win.getAttribute("style") || "", /left:\s*22%/);
  assert.doesNotMatch(win.getAttribute("style") || "", /overflow/);
}

{
  // シーク後: フラグだけ残ってルビ DOM が消えた状態
  const el = new FakeEl();
  el.setAttribute(PROCESSED_ATTR, "k:時間を過ごします");
  el.setAttribute("data-yt-furigana-styled", "1");
  el.textContent = "ここからはいつもの時間を過ごします";
  assert.equal(hasExtensionCaptionMarkup(el), false);
  assert.equal(isCaptionExtensionStale(el), true);

  el.parts = [
    { kind: "ruby", text: "時間" },
    { kind: "rt", text: "じかん" }
  ];
  assert.equal(hasExtensionCaptionMarkup(el), true);
  assert.equal(isCaptionExtensionStale(el), false);
}

{
  // ネイティブ SRV3 ルビ（拡張フラグ無し）は「拡張のマークアップ」ではない
  const el = new FakeEl();
  el.parts = [
    { kind: "ruby", text: "大体" },
    { kind: "rt", text: "だいたい" }
  ];
  assert.equal(hasExtensionCaptionMarkup(el), false);
  assert.equal(isCaptionExtensionStale(el), false);
}

{
  const el = new FakeEl();
  el.parts = [
    { kind: "text", text: "これ" },
    { kind: "ruby", text: "好き" },
    { kind: "rt", text: "すき" }
  ];
  assert.equal(plainTextWithoutRuby(el), "これ好き");
}

{
  const el = new FakeEl();
  el.setAttribute(ORIGINAL_ATTR, "冷製パスタ");
  el.parts = [
    { kind: "text", text: "冷製" },
    { kind: "ruby", text: "パスタ" },
    { kind: "rt", text: "ぱすた" }
  ];
  prepareCaptionForLineFitCapture(el);
  assert.equal(el.textContent, "冷製パスタ");
  assert.equal(el.querySelector("ruby"), null);
}

{
  const el = new FakeEl();
  el.parts = [
    { kind: "text", text: "これ" },
    { kind: "ruby", text: "好き" },
    { kind: "rt", text: "すき" }
  ];
  prepareCaptionForLineFitCapture(el);
  assert.equal(el.textContent, "これ好き");
  assert.equal(el.getAttribute(ORIGINAL_ATTR), "これ好き");
}

{
  const el = new FakeEl();
  el.setAttribute(ORIGINAL_ATTR, "セブンの冷製パスタ");
  el.setAttribute(PROCESSED_ATTR, "k");
  el.parts = [
    { kind: "ruby", text: "冷製" },
    { kind: "rt", text: "れいせい" }
  ];
  const plain = flattenCaptionToPlainText(el);
  assert.equal(plain, "セブンの冷製パスタ");
  assert.equal(el.textContent, plain);
  clearExtensionCaptionAttrs(el);
  assert.equal(el.getAttribute(ORIGINAL_ATTR), null);
  assert.equal(el.getAttribute(PROCESSED_ATTR), null);
}

{
  const el = new FakeEl();
  el.setAttribute(ORIGINAL_ATTR, "セブンイレブンの冷製パスタ");
  el.textContent = "セブンイレブンの冷製パスタ";
  assert.equal(markKeepOneLineCaption(el), true);
  assert.equal(el.getAttribute(KEEP_ONE_LINE_ATTR), "1");
}

console.log("test-caption-teardown: ok");
