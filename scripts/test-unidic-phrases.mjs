import assert from "node:assert/strict";
import {
  getUnidicReading,
  installUnidicPhrasesForTests
} from "furigana-ruby-engine/lib/unidic-phrases.js";
import { rebuildCombinedPhraseTrie } from "furigana-ruby-engine/lib/personal-name-phrases.js";
import { findLongestPhraseAt } from "furigana-ruby-engine/lib/phrase-trie.js";

installUnidicPhrasesForTests({
  形態素: "けいたいそ",
  情報技術: "じょうほうぎじゅつ"
});
const trie = rebuildCombinedPhraseTrie();

assert.equal(getUnidicReading("形態素"), "けいたいそ");
const hit = findLongestPhraseAt(trie, "形態素解析", 0);
assert.ok(hit);
assert.equal(hit.surface, "形態素");
assert.equal(hit.reading, "けいたいそ");

console.log("test-unidic-phrases: ok");
