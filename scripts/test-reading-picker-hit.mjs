import assert from "node:assert/strict";
import {
  findFuriganaWordAtPoint,
  getFuriganaWordHitRect,
  resolveOverlayMountRoot
} from "../src/reading-picker.js";

class FakeRect {
  constructor(left, top, width, height) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
    this.right = left + width;
    this.bottom = top + height;
  }
}

function fakeWord(id, rect, rtRect = null) {
  const word = {
    id,
    className: "yt-furigana-word",
    isConnected: true,
    getBoundingClientRect: () => rect,
    querySelectorAll: (sel) => {
      if (sel !== "rt" || !rtRect) return [];
      return [
        {
          getBoundingClientRect: () => rtRect
        }
      ];
    }
  };
  return word;
}

const words = [
  fakeWord("outer", new FakeRect(0, 0, 200, 40)),
  fakeWord("inner", new FakeRect(20, 5, 40, 30))
];

const root = {
  querySelectorAll: (selector) => {
    assert.equal(selector, ".yt-furigana-word");
    return words;
  },
  contains: () => true
};

globalThis.HTMLElement = class HTMLElement {};
for (const word of words) {
  Object.setPrototypeOf(word, HTMLElement.prototype);
}

assert.equal(findFuriganaWordAtPoint(25, 10, root)?.id, "inner");
assert.equal(findFuriganaWordAtPoint(150, 10, root)?.id, "outer");
assert.equal(findFuriganaWordAtPoint(500, 10, root), null);

// rt だけ上に浮いている場合でもヒットする（TVer の absolute ルビ）
const floated = fakeWord(
  "floated",
  new FakeRect(100, 40, 30, 24),
  new FakeRect(105, 18, 20, 14)
);
Object.setPrototypeOf(floated, HTMLElement.prototype);
const floatRoot = {
  querySelectorAll: () => [floated],
  contains: () => true
};
assert.equal(findFuriganaWordAtPoint(110, 22, floatRoot)?.id, "floated");
assert.equal(findFuriganaWordAtPoint(110, 50, floatRoot)?.id, "floated");
assert.equal(findFuriganaWordAtPoint(10, 22, floatRoot), null);

const hit = getFuriganaWordHitRect(floated);
assert.ok(hit);
assert.ok(hit.top < 40);
assert.ok(hit.bottom > 40);

// 全画面マウント先
{
  const html = { id: "html" };
  const anchor = { id: "word" };
  const fs = {
    id: "fs",
    contains(node) {
      return node === anchor;
    }
  };
  const doc = {
    documentElement: html,
    fullscreenElement: fs,
    webkitFullscreenElement: null
  };
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    assert.equal(resolveOverlayMountRoot(anchor), fs);
    doc.fullscreenElement = null;
    assert.equal(resolveOverlayMountRoot(anchor), html);
  } finally {
    globalThis.document = prev;
  }
}

console.log("reading-picker hit tests passed.");
