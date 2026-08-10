import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installCorporateNamePhrasesForTests,
  getCorporateNameReading,
  getCorporateNamePhraseCount
} from "../src/corporate-name-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../src/station-phrases.js";
import { installWikidataKanaPhrasesForTests } from "../src/wikidata-kana-phrases.js";
import { installSudachiFullPhrasesForTests } from "../src/sudachi-full-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "data/generated/corporate-name-phrases.meta.json");
const sitePath = path.join(root, "data/generated/corporate-name-phrases-site.json");

// フル JSON は数千万エントリ級になり得るので parse しない（meta + site のみ）
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  assert.ok(
    Number(meta.phraseCount || meta.count || 0) > 1000,
    "expected large corporate dict in meta"
  );
}
if (existsSync(sitePath)) {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  installCorporateNamePhrasesForTests(site);
  assert.ok(getCorporateNamePhraseCount() > 100, "expected site subset");
  if (site["任天堂"]) {
    assert.equal(getCorporateNameReading("任天堂"), "にんてんどう");
  }
} else {
  installCorporateNamePhrasesForTests({
    任天堂: "にんてんどう"
  });
  assert.equal(getCorporateNameReading("任天堂"), "にんてんどう");
}

installNeologdPhrasesForTests({});
installPlaceNamePhrasesForTests({});
installStationPhrasesForTests({});
installWikidataKanaPhrasesForTests({});
installSudachiFullPhrasesForTests({});
installPersonalNamePhrasesForTests({});
installCorporateNamePhrasesForTests({
  キーエンス: "きーえんす"
});
rebuildCombinedPhraseTrie();
const hit = findCombinedPhraseMatchAt("キーエンスが発表", 0);
assert.ok(hit);
assert.equal(hit.reading, "きーえんす");

console.log("test-corporate-name-phrases: ok");
