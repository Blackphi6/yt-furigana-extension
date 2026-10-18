#!/usr/bin/env node
/**
 * 同長トークンでも PRODUCT_READING_OVERRIDES は読みを差し替える。
 */
import assert from "node:assert/strict";
import { createBenchTokenizer } from "./learning/bench-utils.mjs";
import { buildFuriganaHtml } from "furigana-ruby-engine/lib/furigana.js";
import { evaluateRubyAgainstExpect } from "furigana-ruby-engine/lib/reading-learning.js";
import { rebuildCombinedPhraseTrie } from "furigana-ruby-engine/lib/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "furigana-ruby-engine/lib/neologd-phrases.js";
import { installUnidicPhrasesForTests } from "furigana-ruby-engine/lib/unidic-phrases.js";
import { installPlaceNamePhrasesForTests } from "furigana-ruby-engine/lib/place-name-phrases.js";
import { installStationPhrasesForTests } from "furigana-ruby-engine/lib/station-phrases.js";
import { installJoyoJukujiPhrasesForTests } from "furigana-ruby-engine/lib/joyo-jukuji-phrases.js";
import { installJaFuriganaPhrasesForTests } from "furigana-ruby-engine/lib/ja-furigana-phrases.js";
import { installWikidataKanaPhrasesForTests } from "furigana-ruby-engine/lib/wikidata-kana-phrases.js";
import { installSudachiFullPhrasesForTests } from "furigana-ruby-engine/lib/sudachi-full-phrases.js";
import { installCorporateNamePhrasesForTests } from "furigana-ruby-engine/lib/corporate-name-phrases.js";
import { installPersonalNamePhrasesForTests } from "furigana-ruby-engine/lib/personal-name-phrases.js";

for (const install of [
  installNeologdPhrasesForTests,
  installUnidicPhrasesForTests,
  installPlaceNamePhrasesForTests,
  installStationPhrasesForTests,
  installJoyoJukujiPhrasesForTests,
  installJaFuriganaPhrasesForTests,
  installWikidataKanaPhrasesForTests,
  installSudachiFullPhrasesForTests,
  installCorporateNamePhrasesForTests,
  installPersonalNamePhrasesForTests
]) {
  install({});
}
rebuildCombinedPhraseTrie({ includeProductReadings: true });

const sudachi = await createBenchTokenizer();
const html = buildFuriganaHtml("旗色", sudachi);
assert.match(html, /はたいろ/);
assert.equal(
  evaluateRubyAgainstExpect(html, [{ surface: "旗", reading: "はた" }]).ok,
  true
);

const html2 = buildFuriganaHtml("類人猿", sudachi);
assert.match(html2, /るいじんえん/);

console.log("test-product-reading-overrides: ok");
