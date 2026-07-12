import assert from "node:assert/strict";
import { findFuriganaWordAtPoint } from "../src/reading-picker.js";

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

function fakeWord(id, rect) {
  return {
    id,
    className: "yt-furigana-word",
    isConnected: true,
    getBoundingClientRect: () => rect
  };
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

// Patch instanceof HTMLElement checks by making Fake inherit via prototype trick:
// findFuriganaWordAtPoint uses `word instanceof HTMLElement`.
// In Node without DOM, HTMLElement is undefined unless we define it.
globalThis.HTMLElement = class HTMLElement {};
for (const word of words) {
  Object.setPrototypeOf(word, HTMLElement.prototype);
}

assert.equal(findFuriganaWordAtPoint(25, 10, root)?.id, "inner");
assert.equal(findFuriganaWordAtPoint(150, 10, root)?.id, "outer");
assert.equal(findFuriganaWordAtPoint(500, 10, root), null);

console.log("reading-picker hit tests passed.");
