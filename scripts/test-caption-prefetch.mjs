import assert from "node:assert/strict";
import { prefetchCaptionFurigana } from "../src/caption-prefetch.js";

const cache = new Map();
const converted = [];

const result = await prefetchCaptionFurigana({
  videoId: "test-video",
  normalize: (text) => text.replace(/\s+/g, " ").trim(),
  convert: async (text) => {
    converted.push(text);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return `<span>${text}</span>`;
  },
  cacheHas: (line) => cache.has(line),
  cacheSet: (line, html) => cache.set(line, html),
  concurrency: 2,
  loadLines: async () => ({
    lines: ["忙しい世界", " 忙しい世界 ", "仕事が忙しい", "忙しい世界"],
    source: "mock"
  })
});

assert.equal(result.converted, 2);
assert.equal(result.skipped, 0);
assert.deepEqual(converted.sort(), ["仕事が忙しい", "忙しい世界"]);
assert.equal(cache.get("忙しい世界"), "<span>忙しい世界</span>");
assert.equal(cache.get("仕事が忙しい"), "<span>仕事が忙しい</span>");

const second = await prefetchCaptionFurigana({
  videoId: "test-video",
  normalize: (text) => text.replace(/\s+/g, " ").trim(),
  convert: async () => {
    throw new Error("should not convert again");
  },
  cacheHas: (line) => cache.has(line),
  cacheSet: (line, html) => cache.set(line, html),
  concurrency: 2,
  loadLines: async () => ({
    lines: ["忙しい世界", "仕事が忙しい"],
    source: "mock"
  })
});

assert.equal(second.converted, 0);
assert.equal(second.skipped, 2);

console.log("caption-prefetch tests passed.");
