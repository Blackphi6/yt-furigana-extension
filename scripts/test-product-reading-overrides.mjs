#!/usr/bin/env node
/**
 * 同長トークンでも PRODUCT_READING_OVERRIDES は読みを差し替える。
 */
import assert from "node:assert/strict";
import { createBenchTokenizer } from "./learning/bench-utils.mjs";
import { buildFuriganaHtml } from "../src/furigana.js";
import { evaluateRubyAgainstExpect } from "../src/reading-learning.js";
import { rebuildCombinedPhraseTrie } from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installUnidicPhrasesForTests } from "../src/unidic-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../src/station-phrases.js";
import { installJoyoJukujiPhrasesForTests } from "../src/joyo-jukuji-phrases.js";
import { installJaFuriganaPhrasesForTests } from "../src/ja-furigana-phrases.js";
import { installWikidataKanaPhrasesForTests } from "../src/wikidata-kana-phrases.js";
import { installSudachiFullPhrasesForTests } from "../src/sudachi-full-phrases.js";
import { installCorporateNamePhrasesForTests } from "../src/corporate-name-phrases.js";
import { installPersonalNamePhrasesForTests } from "../src/personal-name-phrases.js";

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
