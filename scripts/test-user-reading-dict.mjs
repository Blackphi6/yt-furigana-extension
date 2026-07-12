import assert from "node:assert/strict";
import {
  buildLearningCues,
  normalizeUserReadingStore,
  applyUserReadingLearning,
  matchUserContextualReadings
} from "../src/user-reading-dict.js";
import { buildFuriganaHtml } from "../src/furigana.js";
import {
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex,
  resetReadingOverridesToBase
} from "../src/reading-context.js";

const cues = buildLearningCues("永遠", "ただ永遠に愛");
assert.ok(cues.includes("永遠に"), cues);
assert.ok(cues.every((cue) => cue !== "永遠"), cues);

const store = normalizeUserReadingStore({
  version: 2,
  phrases: {},
  contextRules: [
    { surface: "永遠", reading: "とわ", weight: 5, cues: ["永遠に"] }
  ]
});

assert.deepEqual(
  matchUserContextualReadings("永遠", "ただ永遠に愛", store),
  ["とわ"]
);
assert.deepEqual(
  matchUserContextualReadings("永遠", "永遠の愛を歌う", store),
  []
);

resetReadingOverridesToBase();
applyUserReadingLearning(
  MANUAL_PHRASE_READINGS,
  CONTEXT_READING_RULES,
  rebuildManualPhraseIndex,
  store
);

const tokenize = (text) => {
  // 簡易: 永遠を一トークンに
  if (text.includes("永遠")) {
    const parts = [];
    let i = 0;
    while (i < text.length) {
      if (text.startsWith("永遠", i)) {
        parts.push({ surface_form: "永遠", reading: "エイエン", pos: "名詞" });
        i += 2;
        continue;
      }
      parts.push({
        surface_form: text[i],
        reading: text[i],
        pos: "記号"
      });
      i += 1;
    }
    return parts;
  }
  return [{ surface_form: text, reading: text, pos: "名詞" }];
};

const withCue = buildFuriganaHtml("ただ永遠に愛", tokenize);
assert.ok(withCue.includes('data-reading="とわ"'), withCue);

const withoutCue = buildFuriganaHtml("永遠の絆", tokenize);
assert.ok(!withoutCue.includes('data-reading="とわ"'), withoutCue);
assert.ok(
  withoutCue.includes("えいえん") || withoutCue.includes("エイエン") || withoutCue.includes("永遠"),
  withoutCue
);

// 旧形式フラット辞書も読める
const legacy = normalizeUserReadingStore({ 忙しい: "せわしい" });
assert.equal(legacy.phrases["忙しい"], "せわしい");
assert.equal(legacy.contextRules.length, 0);

console.log("user-reading-dict contextual learning tests passed.");
