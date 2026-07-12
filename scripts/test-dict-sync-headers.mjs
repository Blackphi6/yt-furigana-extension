import assert from "node:assert/strict";
import {
  buildReadingApiHeaders,
  normalizeReadingApiUrl
} from "../src/reading-api.js";

assert.deepEqual(buildReadingApiHeaders({}), {
  "Content-Type": "application/json"
});

assert.deepEqual(
  buildReadingApiHeaders({ readingApiKey: "secret" }),
  {
    "Content-Type": "application/json",
    Authorization: "Bearer secret"
  }
);

assert.deepEqual(
  buildReadingApiHeaders({ licenseKey: "ytfp_live_demo_key_001" }),
  {
    "Content-Type": "application/json",
    Authorization: "Bearer ytfp_live_demo_key_001"
  }
);

// API key を優先
assert.equal(
  buildReadingApiHeaders({
    readingApiKey: "api",
    licenseKey: "ytfp_live_demo_key_001"
  }).Authorization,
  "Bearer api"
);

assert.equal(
  normalizeReadingApiUrl("http://127.0.0.1:8765"),
  "http://127.0.0.1:8765/v1/readings"
);

console.log("reading-api headers tests passed.");
