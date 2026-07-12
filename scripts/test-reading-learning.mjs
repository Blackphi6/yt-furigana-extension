import assert from "node:assert/strict";
import {
  aggregatePromotionCandidates,
  applyPromotionCandidates,
  appendLearningEvent,
  buildAmbiguousSamples,
  emptyLearnedOverrides,
  evaluateRubyAgainstExpect,
  extractReadingsFromRubyHtml,
  mergeLearnedOverrides,
  passesPromotionGate,
  readingMatchesExpect
} from "../src/reading-learning.js";

const html =
  '<ruby>忙<rt>せわ</rt></ruby>しい<ruby>世界<rt>せかい</rt></ruby>';
const gotMap = extractReadingsFromRubyHtml(html);
assert.equal(gotMap.get("忙"), "せわ");
assert.equal(
  readingMatchesExpect(gotMap, { surface: "忙しい", reading: "せわしい" }),
  true
);

const evalOk = evaluateRubyAgainstExpect(html, [
  { surface: "忙しい", reading: "せわしい" }
]);
assert.equal(evalOk.ok, true);

const manual = new Map([["一組目", "ひとくみめ"]]);
const rules = [];
const merged = mergeLearnedOverrides(manual, rules, {
  phrases: { 見惚れていた: "みとれていた" },
  contextRules: [
    { surface: "忙しい", reading: "せわしい", weight: 4, cues: ["世界"] }
  ]
});
assert.equal(merged.phraseCount, 1);
assert.equal(merged.ruleCount, 1);
assert.equal(manual.get("見惚れていた"), "みとれていた");
assert.equal(rules[0].reading, "せわしい");

const candidates = aggregatePromotionCandidates(
  [
    { surface: "見惚れていた", reading: "みとれていた", source: "seed", text: "見惚れていた" },
    { surface: "忙しい", reading: "せわしい", source: "runtime", text: "忙しい世界", cues: ["世界"] },
    { surface: "忙しい", reading: "せわしい", source: "hybrid", text: "忙しい夜", cues: ["夜"] }
  ],
  { minVotes: 2 }
);
assert.ok(candidates.some((c) => c.surface === "見惚れていた" && c.type === "phrase"));
assert.ok(candidates.some((c) => c.surface === "忙しい"));

const next = applyPromotionCandidates(emptyLearnedOverrides(), candidates);
assert.equal(next.phrases["見惚れていた"], "みとれていた");

assert.equal(
  passesPromotionGate({ passed: 5, total: 7 }, { passed: 6, total: 7 }),
  true
);
assert.equal(
  passesPromotionGate({ passed: 6, total: 7 }, { passed: 5, total: 7 }),
  false
);

const inbox = appendLearningEvent([], {
  ts: "2026-01-01T00:00:00Z",
  kind: "ambiguous",
  text: "忙しい世界",
  surface: "忙しい",
  reading: "せわしい"
});
assert.equal(inbox.length, 1);

const samples = buildAmbiguousSamples(
  "忙しい世界",
  new Map([["忙しい", "せわしい"]]),
  ["忙しい"]
);
assert.equal(samples[0].surface, "忙しい");

console.log("Reading learning tests passed.");
