import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installJoyoJukujiPhrasesForTests,
  getJoyoJukujiReading
} from "../src/joyo-jukuji-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installUnidicPhrasesForTests } from "../src/unidic-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "data/generated/joyo-jukuji-phrases.json");

if (existsSync(generated)) {
  const phrases = JSON.parse(readFileSync(generated, "utf8"));
  installJoyoJukujiPhrasesForTests(phrases);
  assert.equal(getJoyoJukujiReading("明日"), "あす");
  assert.equal(getJoyoJukujiReading("大人"), "おとな");
} else {
  installJoyoJukujiPhrasesForTests({ 明日: "あす", 大人: "おとな" });
}

installNeologdPhrasesForTests({});
installUnidicPhrasesForTests({});
installPersonalNamePhrasesForTests({});
installJoyoJukujiPhrasesForTests({ 小豆: "あずき" });
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("小豆を煮る", 0);
assert.ok(hit);
assert.equal(hit.reading, "あずき");

console.log("test-joyo-jukuji-phrases: ok");
