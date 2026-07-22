import assert from "node:assert/strict";
import { phrasesFromLearnedOverrides } from "../scripts/export-shared-readings-seed.mjs";

assert.deepEqual(
  phrasesFromLearnedOverrides({
    phrases: { 故郷: "ふるさと", bad: "abc", "": "あ", 市場: "いちば" }
  }),
  { 故郷: "ふるさと", 市場: "いちば" }
);

assert.deepEqual(phrasesFromLearnedOverrides(null), {});
assert.deepEqual(phrasesFromLearnedOverrides({ contextRules: [] }), {});

console.log("shared-readings seed export tests passed.");
