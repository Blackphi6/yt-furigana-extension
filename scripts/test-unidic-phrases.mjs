import assert from "node:assert/strict";
import {
  getUnidicReading,
  installUnidicPhrasesForTests
} from "../src/unidic-phrases.js";
import { rebuildCombinedPhraseTrie } from "../src/personal-name-phrases.js";
import { findLongestPhraseAt } from "../src/phrase-trie.js";

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
