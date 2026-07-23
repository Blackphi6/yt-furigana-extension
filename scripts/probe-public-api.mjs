#!/usr/bin/env node
/**
 * Probe the public Render reading API for routes the demo / Free pack need.
 * Exit 1 on missing critical endpoints (stale deploy drift).
 *
 * Usage:
 *   node scripts/probe-public-api.mjs
 *   PUBLIC_READING_API_URL=https://… node scripts/probe-public-api.mjs
 */
const BASE = (
  process.env.PUBLIC_READING_API_URL ||
  "https://yt-furigana-readings.onrender.com"
).replace(/\/$/, "");

const EXPECTED_BUILD_PREFIX =
  process.env.YT_FURIGANA_EXPECT_BUILD_PREFIX || "";

async function fetchJson(path, options = {}) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { url, status: res.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const health = await fetchJson("/health");
if (health.status !== 200) {
  fail(`/health → ${health.status} (service down or Blueprint missing?)`);
} else {
  ok(`/health buildId=${health.body?.buildId || "?"} engine=${health.body?.engineVersion || "?"}`);
  if (
    EXPECTED_BUILD_PREFIX &&
    !String(health.body?.buildId || "").startsWith(EXPECTED_BUILD_PREFIX)
  ) {
    fail(
      `buildId "${health.body?.buildId}" does not start with expected "${EXPECTED_BUILD_PREFIX}" (stale image?)`
    );
  }
}

const readings = await fetchJson("/v1/readings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "一日", return_candidates: true }),
});
if (readings.status !== 200) {
  fail(`/v1/readings → ${readings.status}`);
} else {
  ok("/v1/readings");
}

const shared = await fetchJson("/v1/shared-readings");
if (shared.status !== 200) {
  fail(`/v1/shared-readings → ${shared.status}`);
} else {
  ok("/v1/shared-readings");
}

const proposals = await fetchJson("/v1/proposals", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    entries: [{ surface: "__probe__", reading: "ぷろーぶ" }],
    source: "ci-probe",
  }),
});
// 200 = accepted, 429 = rate limit (route exists), 404 = stale deploy
if (proposals.status === 404) {
  fail(
    `/v1/proposals → 404 (deploy is stale — enable Auto-Deploy or Manual Deploy latest commit)`
  );
} else if (proposals.status === 200 || proposals.status === 429) {
  ok(`/v1/proposals → ${proposals.status}`);
} else if (proposals.status === 422 || proposals.status === 400) {
  ok(`/v1/proposals reachable → ${proposals.status}`);
} else {
  fail(`/v1/proposals → ${proposals.status} ${String(proposals.text).slice(0, 120)}`);
}

if (process.exitCode) {
  console.error(`\nPublic API drift at ${BASE}`);
  process.exit(process.exitCode);
}
console.log(`\nAll critical routes OK at ${BASE}`);
