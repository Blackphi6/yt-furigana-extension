// 読み推定 v2 の規則表（packages/furigana-ruby-engine/rules/v2-rules.json）を拡張側が読んでいること
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAME_CUES } from "furigana-ruby-engine/lib/name-cues.js";
import { CONTEXT_READING_RULES, MANUAL_PHRASE_READINGS } from "furigana-ruby-engine/lib/reading-context.js";
import { FALSE_SUFFIX_READINGS } from "furigana-ruby-engine/lib/reading-guards.js";

const rules = JSON.parse(
  readFileSync(new URL("../packages/furigana-ruby-engine/rules/v2-rules.json", import.meta.url), "utf8")
);

assert.deepEqual([...NAME_CUES], rules.nameCues);
assert.deepEqual({ ...FALSE_SUFFIX_READINGS }, rules.falseSuffixReadings);
for (const [surface, reading] of Object.entries(rules.phrases)) {
  assert.equal(MANUAL_PHRASE_READINGS.get(surface), reading, surface);
}
for (const rule of rules.contextRules) {
  assert.ok(
    CONTEXT_READING_RULES.some(
      (r) => r.surface === rule.surface && r.reading === rule.reading && rule.cues.every((c) => r.cues.includes(c))
    ),
    `${rule.surface}=${rule.reading}`
  );
}
console.log("共有の規則表のテスト: 問題なし");
