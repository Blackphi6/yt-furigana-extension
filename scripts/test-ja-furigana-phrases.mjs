import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installJaFuriganaPhrasesForTests,
  getJaFuriganaReading,
  getJaFuriganaPhraseCount
} from "../src/ja-furigana-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "data/generated/ja-furigana-phrases.meta.json");
const sitePath = path.join(root, "data/generated/ja-furigana-phrases-site.json");

if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.ok(Number(meta.count || 0) > 100, "expected ja-furigana dict in meta");
}
if (existsSync(sitePath)) {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  installJaFuriganaPhrasesForTests(site);
  assert.ok(getJaFuriganaPhraseCount() > 50);
} else {
  installJaFuriganaPhrasesForTests({ 痛車: "いたしゃ", 仮名: "かな" });
  assert.equal(getJaFuriganaReading("痛車"), "いたしゃ");
}

installNeologdPhrasesForTests({});
installPersonalNamePhrasesForTests({});
installJaFuriganaPhrasesForTests({ 痛車: "いたしゃ" });
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("痛車が走った", 0);
assert.ok(hit);
assert.equal(hit.reading, "いたしゃ");

console.log("test-ja-furigana-phrases: ok");
