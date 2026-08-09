/**
 * 地名フレーズ辞書の回帰テスト
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  installPlaceNamePhrasesForTests,
  getPlaceNameReading,
  getPlaceNamePhraseCount
} from "../src/place-name-phrases.js";
import {
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt,
  installPersonalNamePhrasesForTests
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "data/generated/place-name-phrases.json");
const metaPath = path.join(root, "data/generated/place-name-phrases.meta.json");

if (existsSync(generated)) {
  const phrases = JSON.parse(readFileSync(generated, "utf8"));
  installPlaceNamePhrasesForTests(phrases);
  assert.ok(getPlaceNamePhraseCount() > 1000, "expected large place dict");
  assert.equal(getPlaceNameReading("北海道"), "ほっかいどう");
  assert.ok(getPlaceNameReading("札幌市"));
  assert.ok(
    getPlaceNameReading("富士山") || getPlaceNameReading("沖ノ鳥島"),
    "gazetteer sample should exist"
  );
  // KEN_ALL ギャップ例（ABR/Geolonia に無い町域が載っていれば）
  if (getPlaceNameReading("青宿")) {
    assert.ok(getPlaceNameReading("青宿").length >= 2);
  }
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    assert.ok(meta.contentNotice);
    assert.ok(Array.isArray(meta.sources) && meta.sources.length >= 4);
  }
} else {
  installPlaceNamePhrasesForTests({
    北海道: "ほっかいどう",
    札幌市中央区: "さっぽろしちゅうおうく",
    富士山: "ふじさん",
    旭ケ丘一丁目: "あさひがおかいちちょうめ"
  });
}

installNeologdPhrasesForTests({});
installPersonalNamePhrasesForTests({});
rebuildCombinedPhraseTrie();

const hit = findCombinedPhraseMatchAt("北海道の富士山", 0);
assert.ok(hit);
assert.equal(hit.surface, "北海道");
assert.equal(hit.reading, "ほっかいどう");

const fuji = findCombinedPhraseMatchAt("今日は富士山が見える", 3);
assert.ok(fuji);
assert.equal(fuji.surface, "富士山");

console.log("test-place-name-phrases: ok");
