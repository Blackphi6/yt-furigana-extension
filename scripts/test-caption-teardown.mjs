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
  clearExtensionCaptionAttrs
} from "../src/caption-teardown.js";
import { markKeepOneLineCaption, KEEP_ONE_LINE_ATTR } from "../src/ruby-layout.js";

class FakeEl {
  constructor(className = "ytp-caption-segment") {
    this.className = className;
    this.attrs = new Map();
    this.style = {
      _p: {},
      setProperty(k, v) {
        this._p[k] = v;
      },
      removeProperty(k) {
        delete this._p[k];
      }
    };
    /** @type {{ kind: string, text: string, style?: FakeEl['style'] }[]} */
    this.parts = [];
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this.attrs.delete(name);
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

assert.equal(normalizeCaptionPlain("  a\u200b  b  "), "a b");

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
