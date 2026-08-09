/**
 * 駅フレーズ辞書の回帰テスト
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installStationPhrasesForTests,
  getStationReading,
  getStationPhraseCount
} from "../src/station-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "data/generated/station-phrases.json");
const metaPath = path.join(root, "data/generated/station-phrases.meta.json");

if (existsSync(generated)) {
  const phrases = JSON.parse(readFileSync(generated, "utf8"));
  installStationPhrasesForTests(phrases);
  assert.ok(getStationPhraseCount() > 1000, "expected large station dict");
  assert.equal(getStationReading("放出"), "はなてん");
  assert.equal(getStationReading("放出駅"), "はなてんえき");
  assert.equal(getStationReading("十三"), "じゅうそう");
  assert.equal(getStationReading("十三駅"), "じゅうそうえき");
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.ok(meta.contentNotice);
    assert.match(String(meta.license || ""), /Apache/i);
  }
} else {
  installStationPhrasesForTests({
    放出: "はなてん",
    放出駅: "はなてんえき",
    十三: "じゅうそう",
    十三駅: "じゅうそうえき"
  });
}

// 地名の「十三」→じゅうさん を駅が上書き
installNeologdPhrasesForTests({});
installPlaceNamePhrasesForTests({ 十三: "じゅうさん" });
installPersonalNamePhrasesForTests({});
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("十三に着いた", 0);
assert.ok(hit);
assert.equal(hit.reading, "じゅうそう");

console.log("test-station-phrases: ok");
