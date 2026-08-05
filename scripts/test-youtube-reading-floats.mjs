import assert from "node:assert/strict";
import {
  extractReadingAnchors,
  filterAnchorsWithoutNativeRuby,
  unionClientRects,
  captionHasPreexistingFurigana,
  listNativeRubyBases,
  NATIVE_SKIP_ATTR
} from "../src/youtube-reading-floats.js";
import {
  PROCESSED_ATTR,
  hasExtensionCaptionMarkup
} from "../src/caption-teardown.js";

const html = `<span class="yt-furigana-word" data-surface="本当" data-reading="ほんとう"><ruby>本当<rt>ほんとう</rt></ruby></span>にわかんないんだよ`;
const anchors = extractReadingAnchors(html);
assert.equal(anchors.length, 1);
assert.equal(anchors[0].surface, "本当");
assert.equal(anchors[0].reading, "ほんとう");

const multi = `<span class="yt-furigana-word" data-surface="褪せ" data-reading="あせ">褪せ</span>ないような<span class="yt-furigana-word" data-surface="花" data-reading="はな">花</span>`;
assert.deepEqual(extractReadingAnchors(multi), [
  { surface: "褪せ", reading: "あせ" },
  { surface: "花", reading: "はな" }
]);

const tipHtml = `<span class="yt-furigana-word yt-furigana-word--tip" data-surface="360" data-reading="さんびゃくろくじゅう">360</span>`;
assert.equal(extractReadingAnchors(tipHtml).length, 0);

assert.equal(unionClientRects([]), null);
assert.deepEqual(
  unionClientRects([
    { left: 10, top: 20, right: 40, bottom: 50, width: 30, height: 30 },
    { left: 35, top: 18, right: 60, bottom: 48, width: 25, height: 30 }
  ]),
  { left: 10, top: 18, width: 50, height: 32 }
);

const songAnchors = extractReadingAnchors(
  `<span class="yt-furigana-word" data-surface="雨" data-reading="あめ"><ruby>雨<rt>あめ</rt></ruby></span>とカプチーノ`
);
assert.deepEqual(filterAnchorsWithoutNativeRuby(songAnchors, ["雨"]), []);
assert.equal(filterAnchorsWithoutNativeRuby(songAnchors, []).length, 1);

/** 既存ルビ検出用の最小 HTMLElement モック */
class CaptionEl {
  constructor() {
    this.attrs = new Map();
    /** @type {CaptionNode[]} */
    this.children = [];
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const s = String(sel);
    /** @type {CaptionNode[]} */
    const out = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (matchSel(node, s)) out.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(this.children);
    return out;
  }
}

class CaptionNode {
  /**
   * @param {string} tag
   * @param {string} [text]
   */
  constructor(tag, text = "") {
    this.tag = tag;
    this.text = text;
    /** @type {CaptionNode[]} */
    this.children = [];
    this.className = "";
  }
  get textContent() {
    if (this.children.length) {
      return this.children.map((c) => c.textContent).join("");
    }
    return this.text;
  }
  closest(sel) {
    const s = String(sel);
    if (matchSel(this, s)) return this;
    return null;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const s = String(sel);
    /** @type {CaptionNode[]} */
    const out = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (matchSel(node, s)) out.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(this.children);
    return out;
  }
  cloneNode() {
    const c = new CaptionNode(this.tag, this.text);
    c.className = this.className;
    c.children = this.children.map((ch) => {
      const child = ch.cloneNode();
      child.parent = c;
      return child;
    });
    return c;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
  }
}

/**
 * @param {CaptionNode} node
 * @param {string} sel
 */
function matchSel(node, sel) {
  const parts = sel.split(",").map((p) => p.trim());
  return parts.some((part) => {
    if (part.startsWith(".")) {
      return node.className.split(/\s+/).includes(part.slice(1));
    }
    if (part.startsWith("[")) {
      return false;
    }
    const tag = part.replace(/:scope\s*>\s*/g, "").trim();
    return node.tag === tag;
  });
}

globalThis.HTMLElement = CaptionEl;

{
  // YouTube 側の既存 <ruby>（拡張マーク無し）→ スキップ対象
  const el = new CaptionEl();
  const ruby = new CaptionNode("ruby");
  const base = new CaptionNode("#text", "大体");
  const rt = new CaptionNode("rt", "だいたい");
  ruby.children = [base, rt];
  el.children = [ruby, new CaptionNode("#text", "自動")];
  assert.deepEqual(listNativeRubyBases(el), ["大体"]);
  assert.equal(captionHasPreexistingFurigana(el), true);
  assert.equal(hasExtensionCaptionMarkup(el), false);
}

{
  // 拡張が差し込んだルビは「既存」ではない
  const el = new CaptionEl();
  el.setAttribute(PROCESSED_ATTR, "k:大体");
  el.setAttribute("data-yt-furigana-styled", "1");
  const word = new CaptionNode("span");
  word.className = "yt-furigana-word";
  const ruby = new CaptionNode("ruby");
  ruby.children = [
    new CaptionNode("#text", "大体"),
    new CaptionNode("rt", "だいたい")
  ];
  word.children = [ruby];
  el.children = [word];
  assert.equal(captionHasPreexistingFurigana(el), false);
  assert.equal(hasExtensionCaptionMarkup(el), true);
}

{
  // skip 印があれば常に既存扱い
  const el = new CaptionEl();
  el.setAttribute(NATIVE_SKIP_ATTR, "1");
  assert.equal(captionHasPreexistingFurigana(el), true);
}

{
  // プレーン字幕は既存ルビなし
  const el = new CaptionEl();
  el.children = [new CaptionNode("#text", "こんにちは")];
  assert.equal(captionHasPreexistingFurigana(el), false);
  assert.equal(hasExtensionCaptionMarkup(el), false);
}

console.log("youtube-reading-floats tests passed.");
