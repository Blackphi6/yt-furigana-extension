import assert from "node:assert/strict";
import { isRetryableDictFetchError } from "../src/dict-gzip-fetch.js";

assert.equal(isRetryableDictFetchError(new Error("Failed to fetch")), true);
assert.equal(
  isRetryableDictFetchError(new Error("extension context invalidated")),
  true
);
assert.equal(isRetryableDictFetchError(new Error("HTTP 404")), false);

console.log("test-dict-gzip-fetch: ok");
