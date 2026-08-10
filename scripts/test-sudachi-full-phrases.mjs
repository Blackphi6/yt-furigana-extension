import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installSudachiFullPhrasesForTests,
  getSudachiFullReading,
  getSudachiFullPhraseCount
} from "../src/sudachi-full-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installCorporateNamePhrasesForTests } from "../src/corporate-name-phrases.js";
import { installWikidataKanaPhrasesForTests } from "../src/wikidata-kana-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../src/station-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "data/generated/sudachi-full-phrases.meta.json");
const sitePath = path.join(root, "data/generated/sudachi-full-phrases-site.json");

if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.ok(
    Number(meta.phraseCount || meta.count || 0) > 1000,
    "expected large sudachi-full dict in meta"
  );
}
if (existsSync(sitePath)) {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  installSudachiFullPhrasesForTests(site);
  assert.ok(getSudachiFullPhraseCount() > 100, "expected site subset");
} else {
  installSudachiFullPhrasesForTests({ 東京: "とうきょう" });
  assert.equal(getSudachiFullReading("東京"), "とうきょう");
}

installNeologdPhrasesForTests({});
installPlaceNamePhrasesForTests({});
installStationPhrasesForTests({});
installCorporateNamePhrasesForTests({});
installWikidataKanaPhrasesForTests({});
installPersonalNamePhrasesForTests({});
installSudachiFullPhrasesForTests({ 任天堂: "にんてんどう" });
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("任天堂のゲーム", 0);
assert.ok(hit);
assert.equal(hit.reading, "にんてんどう");

console.log("test-sudachi-full-phrases: ok");
