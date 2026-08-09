/**
 * 「一段落」が UniDic「一段」に食い荒らされないこと。
 */
import assert from "node:assert/strict";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import path from "node:path";
import kuromoji from "kuromoji";
import { buildFuriganaHtml } from "../src/furigana.js";
import { MANUAL_PHRASE_READINGS } from "../src/reading-context.js";
import { installUnidicPhrasesForTests } from "../src/unidic-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../src/station-phrases.js";
import {
  installPersonalNamePhrasesForTests,
  rebuildCombinedPhraseTrie,
  findCombinedPhraseMatchAt
} from "../src/personal-name-phrases.js";

assert.equal(MANUAL_PHRASE_READINGS.get("一段落"), "いちだんらく");

async function loadGz(p) {
  const chunks = [];
  for await (const c of createReadStream(p).pipe(createGunzip())) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const unidicGz = path.join(root, "data/generated/unidic-phrases.json.gz");
if (existsSync(unidicGz)) {
  const unidic = await loadGz(unidicGz);
  assert.equal(unidic["一段落"], "いちだんらく");
  installUnidicPhrasesForTests(unidic);
} else {
  installUnidicPhrasesForTests({ 一段: "いちだん", 一段落: "いちだんらく" });
}
installNeologdPhrasesForTests({});
installPlaceNamePhrasesForTests({});
installStationPhrasesForTests({});
installPersonalNamePhrasesForTests({});
rebuildCombinedPhraseTrie();

const hit = findCombinedPhraseMatchAt("一段落した", 0);
assert.ok(hit);
assert.equal(hit.surface, "一段落");
assert.equal(hit.reading, "いちだんらく");

const dicPath = existsSync(path.join(root, "dict/base.dat.gz"))
  ? path.join(root, "dict")
  : path.join(root, "node_modules/kuromoji/dict");
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
});
const html = buildFuriganaHtml("作業が一段落した頃には、", (s) => tokenizer.tokenize(s));
assert.match(html, /data-surface="一段落" data-reading="いちだんらく"/);
assert.doesNotMatch(html, /data-surface="一段"[^>]*data-reading="いちだん"/);

const sitePath = path.join(root, "site/unidic-phrases.json");
if (existsSync(sitePath)) {
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  assert.equal(site["一段落"], "いちだんらく");
}

console.log("test-ichidanraku: ok");
