/**
 * Unit smoke for lattice-feed builder (truncate / bySource / newest-first / corpus merge).
 */
import assert from "node:assert/strict";
import {
  buildLatticeFeed,
  normalizeLatticeEntry,
  truncateRaw,
  RAW_MAX,
  MAX_ENTRIES,
} from "../scripts/learning/write-lattice-feed.mjs";

assert.equal(truncateRaw("あ".repeat(10), 5), "あああああ…");
assert.equal(truncateRaw("短い"), "短い");
assert.ok(RAW_MAX >= 100);
assert.ok(MAX_ENTRIES >= 100);

{
  const dropped = normalizeLatticeEntry({
    text: "x",
    surface: "市場",
    api_key: "secret",
    candidates: ["いちば", "しじょう"],
    gold: "しじょう",
    source: "verify_agree",
    verify_raw: "x".repeat(500),
  });
  assert.ok(dropped);
  assert.equal(dropped.api_key, undefined);
  assert.ok(dropped.verify_raw.endsWith("…"));
  assert.ok(dropped.verify_raw.length <= RAW_MAX + 1);
}

{
  const logRows = [];
  for (let i = 0; i < 5; i += 1) {
    logRows.push({
      ts: `2026-01-0${i + 1}T00:00:00Z`,
      text: `文${i}`,
      surface: "市場",
      candidates: ["いちば", "しじょう"],
      gold: i % 2 ? "いちば" : "しじょう",
      source: i % 2 ? "arbitrate_agree" : "verify_agree",
      verify_raw: "ok",
      arb_raw: "",
    });
  }
  const feed = buildLatticeFeed(logRows, [], { maxEntries: 3 });
  assert.equal(feed.summary.total, 5);
  assert.equal(feed.summary.shown, 3);
  assert.equal(feed.entries[0].text, "文4", "newest first");
  assert.equal(feed.entries[2].text, "文2");
  assert.equal(feed.summary.bySource.verify_agree, 2);
  assert.equal(feed.summary.bySource.arbitrate_agree, 1);
}

{
  const corpus = [
    {
      text: "コーパス文",
      surface: "市場",
      candidates: ["いちば", "しじょう"],
      gold: "いちば",
      source: "llm-synth:old",
    },
  ];
  const log = [
    {
      ts: "2026-08-01T00:00:00Z",
      text: "コーパス文",
      surface: "市場",
      candidates: ["いちば", "しじょう"],
      gold: "いちば",
      source: "verify_agree",
      verify_guess: "いちば",
      verify_raw: "いちば",
    },
  ];
  const feed = buildLatticeFeed(log, corpus);
  assert.equal(feed.summary.total, 1);
  assert.equal(feed.entries[0].source, "verify_agree");
  assert.equal(feed.entries[0].verify_guess, "いちば");
}

console.log("test-lattice-feed: ok");
