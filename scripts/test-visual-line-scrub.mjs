/**
 * visual-line 残骸掃除の回帰（OFF 後に display:inline + font-size だけ残る問題）。
 */
import assert from "node:assert/strict";
import { scrubYouTubeVisualLineArtifacts } from "../src/caption-styles.js";

class FakeStyle {
  constructor(owner) {
    this.owner = owner;
    this._p = {};
  }
  setProperty(k, v) {
    this._p[k] = String(v);
    this.owner._sync();
  }
  removeProperty(k) {
    delete this._p[k];
    this.owner._sync();
  }
  getPropertyValue(k) {
    return this._p[k] || "";
  }
}

class FakeLine {
  constructor() {
    this.className = "caption-visual-line";
    this.attrs = new Map();
    this.style = new FakeStyle(this);
    this._segment = { className: "ytp-caption-segment" };
  }
  _sync() {
    const parts = Object.entries(this.style._p).map(([k, v]) => `${k}: ${v}`);
    if (parts.length) this.attrs.set("style", parts.join("; "));
    else this.attrs.delete("style");
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this.attrs.delete(name);
    if (name === "style") this.style._p = {};
  }
  querySelector(sel) {
    if (String(sel).includes("ytp-caption-segment")) return this._segment;
    return null;
  }
}

globalThis.HTMLElement = FakeLine;
globalThis.getComputedStyle = () => ({ display: "inline" });

{
  const line = new FakeLine();
  line.setAttribute("style", "font-size: 31.5556px;");
  line.style._p["font-size"] = "31.5556px";

  const root = {
    querySelectorAll(sel) {
      assert.equal(sel, ".caption-visual-line");
      return [line];
    }
  };

  scrubYouTubeVisualLineArtifacts(root);
  assert.equal(line.style.getPropertyValue("font-size"), "");
  assert.equal(line.style.getPropertyValue("display"), "block");
}

console.log("test-visual-line-scrub: ok");
