import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import kuromoji from "kuromoji";
import { buildFuriganaHtml } from "../src/furigana.js";
import {
  installNeologdPhrasesForTests,
  getNeologdPhraseCount,
  getNeologdReading
} from "../src/neologd-phrases.js";
import { buildPhraseTrie, findLongestPhraseAt } from "../src/phrase-trie.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..");
const dictPath = path.join(repo, "dict");
const gzPath = path.join(repo, "data", "generated", "neologd-phrases.json.gz");

const phrases = JSON.parse(gunzipSync(readFileSync(gzPath)).toString("utf8"));
installNeologdPhrasesForTests(phrases);

assert.ok(getNeologdPhraseCount() > 100000, "phrase count");
assert.equal(getNeologdReading("鬼滅の刃"), "きめつのやいば");
assert.equal(getNeologdReading("呪術廻戦"), "じゅじゅつかいせん");

const trie = buildPhraseTrie({
  鬼滅の刃: "きめつのやいば",
  鬼滅: "きめつ"
});
assert.deepEqual(findLongestPhraseAt(trie, "今日は鬼滅の刃を見る", 3), {
  surface: "鬼滅の刃",
  reading: "きめつのやいば"
});

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: dictPath }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});

const html = buildFuriganaHtml("鬼滅の刃を見た", (text) => tokenizer.tokenize(text));
assert.match(html, /data-surface="鬼滅の刃"/);
assert.match(html, /data-reading="きめつのやいば"/);
assert.ok(html.includes("きめつ") && html.includes("やいば"), html);

console.log("NEologd phrase tests passed.");
console.log(html);
