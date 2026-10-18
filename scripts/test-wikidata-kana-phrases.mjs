import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installWikidataKanaPhrasesForTests,
  getWikidataKanaReading,
  getWikidataKanaPhraseCount
} from "furigana-ruby-engine/lib/wikidata-kana-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "furigana-ruby-engine/lib/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "furigana-ruby-engine/lib/neologd-phrases.js";
import { installCorporateNamePhrasesForTests } from "furigana-ruby-engine/lib/corporate-name-phrases.js";
import { installSudachiFullPhrasesForTests } from "furigana-ruby-engine/lib/sudachi-full-phrases.js";
import { installPlaceNamePhrasesForTests } from "furigana-ruby-engine/lib/place-name-phrases.js";
import { installStationPhrasesForTests } from "furigana-ruby-engine/lib/station-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "data/generated/wikidata-kana-phrases.meta.json");
const sitePath = path.join(root, "data/generated/wikidata-kana-phrases-site.json");

if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.ok(
    Number(meta.phraseCount || meta.count || 0) > 1000,
    "expected large wikidata dict in meta"
  );
}
if (existsSync(sitePath)) {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  installWikidataKanaPhrasesForTests(site);
  assert.ok(getWikidataKanaPhraseCount() > 100, "expected site subset");
} else {
  installWikidataKanaPhrasesForTests({
    葛飾北斎: "かつしかほくさい",
    尾田栄一郎: "おだえいいちろう"
  });
  assert.equal(getWikidataKanaReading("葛飾北斎"), "かつしかほくさい");
}

installNeologdPhrasesForTests({});
installPlaceNamePhrasesForTests({});
installStationPhrasesForTests({});
installCorporateNamePhrasesForTests({});
installSudachiFullPhrasesForTests({});
installPersonalNamePhrasesForTests({});
installWikidataKanaPhrasesForTests({ 葛飾北斎: "かつしかほくさい" });
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("葛飾北斎の絵", 0);
assert.ok(hit);
assert.equal(hit.reading, "かつしかほくさい");

console.log("test-wikidata-kana-phrases: ok");
