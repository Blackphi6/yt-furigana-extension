import assert from "node:assert/strict";
import {
  buildReadingApiRequest,
  normalizeReadingApiUrl,
  parseReadingApiResponse,
  readingApiOriginPattern,
  readingApiSpansToHtml,
  readingApiTokensToHtml,
  validateReadingApiTokens,
  userDictToApiEntries
} from "../src/reading-api.js";

assert.equal(normalizeReadingApiUrl(""), "");
assert.equal(
  normalizeReadingApiUrl("https://ja.2-38.com"),
  "https://ja.2-38.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("https://ja.2-38.com/"),
  "https://ja.2-38.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("https://ja.2-38.com/v1/readings"),
  "https://ja.2-38.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("http://127.0.0.1:8080/v1/readings/"),
  "http://127.0.0.1:8080/v1/readings"
);

assert.deepEqual(userDictToApiEntries({ 東海林: "しょうじ", 忙しい: "せわしい" }), [
  { surface: "東海林", reading: "しょうじ" },
  { surface: "忙しい", reading: "せわしい" }
]);

const request = buildReadingApiRequest("辛いラーメン", { 辛い: "からい" });
assert.equal(request.text, "辛いラーメン");
assert.equal(request.return_candidates, true);
assert.deepEqual(request.user_dict, [{ surface: "辛い", reading: "からい" }]);

const fullTokens = [
  { surface: "辛い", reading: "からい", confidence: 0.99, source: "reranker" },
  { surface: "ラーメン", reading: "らーめん", confidence: 1, source: "dict" }
];
assert.equal(validateReadingApiTokens("辛いラーメン", fullTokens), true);
assert.equal(validateReadingApiTokens("甘いラーメン", fullTokens), false);

const html = readingApiTokensToHtml(fullTokens);
assert.match(html, /yt-furigana-word/);
assert.match(html, /data-surface="辛い"/);
assert.match(html, /data-reading="からい"/);
assert.match(html, /<ruby>辛<rt>から<\/rt><\/ruby>い/);
assert.match(html, /ラーメン/);

// JRM public API returns span-only tokens (not full coverage)
const original = "東海林さんが辛いラーメンを食べた。";
const spanTokens = [
  {
    surface: "東海林",
    span: [0, 3],
    reading: "しょうじ",
    source: "user_dict"
  },
  {
    surface: "辛い",
    span: [6, 8],
    reading: "からい",
    source: "reranker"
  },
  {
    surface: "食べ",
    span: [13, 15],
    reading: "たべ",
    source: "base_engine"
  }
];
assert.equal(validateReadingApiTokens(original, spanTokens), true);

const spanHtml = readingApiSpansToHtml(original, spanTokens);
assert.match(spanHtml, /data-surface="東海林"/);
assert.match(spanHtml, /data-reading="しょうじ"/);
assert.match(spanHtml, /さんが/);
assert.match(spanHtml, /ラーメンを/);
assert.match(spanHtml, /た。$/);

const parsed = parseReadingApiResponse({ tokens: spanTokens }, original);
assert.equal(parsed, spanHtml);

assert.equal(
  readingApiOriginPattern("https://ja.2-38.com/v1/readings"),
  "https://ja.2-38.com/*"
);
assert.equal(readingApiOriginPattern(""), null);

console.log("Reading API tests passed.");
