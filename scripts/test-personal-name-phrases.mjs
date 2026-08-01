/**
 * 人名フレーズ辞書（姓）の結合・経沢補完の回帰テスト
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import kuromoji from "kuromoji";
import { buildFuriganaHtml } from "../src/furigana.js";
import {
  installPersonalNamePhrasesForTests,
  getPersonalNameReading,
  rebuildCombinedPhraseTrie
} from "../src/personal-name-phrases.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = path.join(root, "data/generated/personal-name-phrases.json");
const extra = path.join(root, "data/personal-name-extra.json");

assert.ok(existsSync(extra), "personal-name-extra.json missing");
const extraJson = JSON.parse(readFileSync(extra, "utf8"));
assert.equal(extraJson["経沢"], "つねざわ");

if (existsSync(generated)) {
  const phrases = JSON.parse(readFileSync(generated, "utf8"));
  assert.equal(phrases["佐藤"], "さとう");
  assert.equal(phrases["経沢"], "つねざわ", "経沢 must come from extra merge");
  installPersonalNamePhrasesForTests(phrases);
} else {
  installPersonalNamePhrasesForTests({
    佐藤: "さとう",
    経沢: "つねざわ",
    高橋: "たかはし"
  });
}

installNeologdPhrasesForTests({});
rebuildCombinedPhraseTrie();

assert.equal(getPersonalNameReading("経沢"), "つねざわ");
assert.equal(getPersonalNameReading("佐藤"), "さとう");

const dictPath = path.join(root, "dict");
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: dictPath }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});

const html = buildFuriganaHtml("経沢香織です", (text) => tokenizer.tokenize(text));
assert.ok(
  html.includes('data-surface="経沢"') && html.includes("つねざわ"),
  `expected 経沢→つねざわ ruby, got: ${html}`
);

const sato = buildFuriganaHtml("佐藤さん", (text) => tokenizer.tokenize(text));
assert.ok(
  sato.includes("さとう") || sato.includes('data-reading="さとう"'),
  `expected 佐藤 reading, got: ${sato}`
);

console.log("test-personal-name-phrases: ok");
