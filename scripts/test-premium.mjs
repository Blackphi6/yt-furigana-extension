import assert from "node:assert/strict";
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  PLAN_FREE,
  PLAN_PREMIUM,
  DEFAULT_SPONSORS_URL,
  DEFAULT_SITE_URL,
  DEFAULT_PRICING_URL,
  normalizePlan,
  isPremiumPlan,
  canUseFeature,
  resolveEntitlement,
  parseLicenseKeyShape,
  mergeDictPreferNewer,
  buildSyncPayload,
  applySharedDictEntries
} from "../src/premium.js";

assert.equal(normalizePlan("premium"), PLAN_PREMIUM);
assert.equal(normalizePlan("PRO"), PLAN_PREMIUM);
assert.equal(normalizePlan(""), PLAN_FREE);
assert.equal(normalizePlan("free"), PLAN_FREE);

assert.equal(isPremiumPlan(PLAN_PREMIUM), true);
assert.equal(isPremiumPlan(PLAN_FREE), false);

assert.equal(canUseFeature(PLAN_FREE, "localFurigana"), true);
assert.equal(canUseFeature(PLAN_FREE, "dictSync"), false);
assert.equal(canUseFeature(PLAN_PREMIUM, "dictSync"), true);
assert.equal(canUseFeature(PLAN_PREMIUM, "sharedDict"), true);
assert.equal(canUseFeature(PLAN_FREE, "sharedDict"), false);
assert.equal(canUseFeature(PLAN_PREMIUM, "hostedReadingApi"), true);

assert.ok(FREE_FEATURES.includes("localFurigana"));
assert.ok(PREMIUM_FEATURES.includes("dictSync"));
assert.ok(DEFAULT_SPONSORS_URL.includes("github.com"));
assert.ok(DEFAULT_SITE_URL.includes("github.io"));
assert.ok(DEFAULT_PRICING_URL.includes("pricing.html"));

assert.equal(parseLicenseKeyShape("").ok, false);
assert.equal(parseLicenseKeyShape("short").ok, false);
assert.equal(parseLicenseKeyShape("ytfp_test_license_key_ok").ok, true);
assert.equal(parseLicenseKeyShape("YTFP_ABC_DEF_GHI_JKL").ok, true);

const expired = resolveEntitlement({
  plan: PLAN_PREMIUM,
  premiumExpiresAt: "2000-01-01T00:00:00.000Z"
});
assert.equal(expired.plan, PLAN_FREE);
assert.equal(expired.reason, "expired");

const active = resolveEntitlement({
  plan: PLAN_PREMIUM,
  premiumExpiresAt: "2999-01-01T00:00:00.000Z",
  licenseKey: "ytfp_live_demo_key_001"
});
assert.equal(active.plan, PLAN_PREMIUM);
assert.equal(canUseFeature(active.plan, "dictSync"), true);

const merged = mergeDictPreferNewer(
  { 直: "なお", 名前: "なまえ" },
  { 直書き: "じかがき", 直: "じか" },
  { remoteRevisedAt: "2026-07-12T00:00:00.000Z", localRevisedAt: "2026-07-11T00:00:00.000Z" }
);
assert.equal(merged.直書き, "じかがき");
assert.equal(merged.直, "じか");
assert.equal(merged.名前, "なまえ");

const localWins = mergeDictPreferNewer(
  { 直: "なお" },
  { 直: "じか" },
  { remoteRevisedAt: "2026-07-10T00:00:00.000Z", localRevisedAt: "2026-07-12T00:00:00.000Z" }
);
assert.equal(localWins.直, "なお");

const payload = buildSyncPayload({ 何故か: "なぜか" }, "2026-07-12T01:00:00.000Z");
assert.deepEqual(payload, {
  dict: { 何故か: "なぜか" },
  revisedAt: "2026-07-12T01:00:00.000Z"
});

const manual = new Map([["夏日", "なつび"]]);
const applied = applySharedDictEntries(manual, {
  直書き: "じかがき",
  夏日: "なつび"
});
assert.equal(applied, 1);
assert.equal(manual.get("直書き"), "じかがき");

console.log("premium tests passed.");
