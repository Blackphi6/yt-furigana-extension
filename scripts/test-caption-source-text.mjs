import assert from "node:assert/strict";

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** Mirrors content.js plainTextWithoutRuby */
function plainTextWithoutRuby(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("rt, rp").forEach((node) => node.remove());
  return normalizeText(clone.textContent ?? "");
}

function createRubyCaption() {
  const rtNodes = [];
  const root = {
    textContent: "明日あすも息いきを切らしたい",
    querySelectorAll(selector) {
      if (selector === "rt, rp") return rtNodes;
      return [];
    },
    cloneNode() {
      const childRts = [
        { remove() { this._removed = true; } },
        { remove() { this._removed = true; } },
        { remove() { this._removed = true; } }
      ];
      return {
        querySelectorAll(selector) {
          if (selector === "rt, rp") return childRts.filter((n) => !n._removed);
          return [];
        },
        get textContent() {
          const alive = childRts.some((n) => !n._removed);
          return alive
            ? "明日あすも息いきを切らしたい"
            : "明日も息を切らしたい";
        }
      };
    }
  };
  return root;
}

const el = createRubyCaption();
assert.equal(el.textContent, "明日あすも息いきを切らしたい");
assert.equal(plainTextWithoutRuby(el), "明日も息を切らしたい");

console.log("caption-source-text tests passed.");
