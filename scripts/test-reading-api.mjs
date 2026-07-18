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
  normalizeReadingApiUrl("https://readings.example.com"),
  "https://readings.example.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("https://readings.example.com/"),
  "https://readings.example.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("https://readings.example.com/v1/readings"),
  "https://readings.example.com/v1/readings"
);
assert.equal(
  normalizeReadingApiUrl("http://127.0.0.1:8080/v1/readings/"),
  "http://127.0.0.1:8080/v1/readings"
);

assert.deepEqual(userDictToApiEntries({ 葛飾: "かつしか", 忙しい: "せわしい" }), [
  { surface: "葛飾", reading: "かつしか" },
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

// Span-only partial tokens (not full coverage)
const original = "葛飾で辛いラーメンを食べた。";
const spanTokens = [
  {
    surface: "葛飾",
    span: [0, 2],
    reading: "かつしか",
    source: "user_dict"
  },
  {
    surface: "辛い",
    span: [3, 5],
    reading: "からい",
    source: "reranker"
  },
  {
    surface: "食べ",
    span: [10, 12],
    reading: "たべ",
    source: "base_engine"
  }
];
assert.equal(validateReadingApiTokens(original, spanTokens), true);

const spanHtml = readingApiSpansToHtml(original, spanTokens);
assert.match(spanHtml, /data-surface="葛飾"/);
assert.match(spanHtml, /data-reading="かつしか"/);
assert.match(spanHtml, /で/);
assert.match(spanHtml, /ラーメンを/);
assert.match(spanHtml, /た。$/);

const parsed = parseReadingApiResponse({ tokens: spanTokens }, original);
assert.equal(parsed, spanHtml);

assert.equal(
  readingApiOriginPattern("https://readings.example.com/v1/readings"),
  "https://readings.example.com/*"
);
assert.equal(readingApiOriginPattern(""), null);

console.log("Reading API tests passed.");
