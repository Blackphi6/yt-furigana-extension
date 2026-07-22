import assert from "node:assert/strict";
import {
  splitContributionContext,
  resolvePublicApiBase,
  mergeSharedPackPreferLocal
} from "../src/contributions.js";
import {
  DEFAULT_SETTINGS,
  PUBLIC_READING_API_URL
} from "../src/default-settings.js";

assert.equal(DEFAULT_SETTINGS.contributionEnabled, false);
assert.equal(DEFAULT_SETTINGS.sharedPackEnabled, true);
assert.ok(PUBLIC_READING_API_URL.includes("onrender.com"));

// Free pack must ignore Premium sync URL
assert.equal(
  resolvePublicApiBase({ readingApiUrl: "http://127.0.0.1:8765" }),
  PUBLIC_READING_API_URL
);

assert.equal(
  resolvePublicApiBase({ readingApiUrl: "" }),
  PUBLIC_READING_API_URL
);
assert.equal(
  resolvePublicApiBase({ readingApiUrl: "http://127.0.0.1:8765" }),
  PUBLIC_READING_API_URL
);
assert.equal(
  resolvePublicApiBase({
    readingApiUrl: "http://127.0.0.1:8765/v1/readings"
  }),
  PUBLIC_READING_API_URL
);

assert.deepEqual(splitContributionContext("今この世で君だけ大正解", "大正解", 4), {
  contextLeft: "で君だけ",
  contextRight: ""
});

assert.deepEqual(
  splitContributionContext("頸動脈からアイラブユーが噴き出て", "頸動脈", 3),
  {
    contextLeft: "",
    contextRight: "からア"
  }
);

assert.deepEqual(
  mergeSharedPackPreferLocal({ 何故: "なぜ" }, { 何故: "なにゆえ", 夏日: "なつび" }),
  { 何故: "なぜ", 夏日: "なつび" }
);

console.log("contributions client tests passed.");
