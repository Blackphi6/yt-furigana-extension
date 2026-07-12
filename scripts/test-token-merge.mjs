import assert from "node:assert/strict";
import { mergeTokensForRuby } from "../src/token-merge.js";
import { buildFuriganaHtml } from "../src/furigana.js";
import kuromoji from "kuromoji";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tokens = [
  {
    surface_form: "夏",
    reading: "ナツ",
    pos: "名詞",
    pos_detail_1: "一般",
    conjugated_form: "*"
  },
  {
    surface_form: "日",
    reading: "ビ",
    pos: "名詞",
    pos_detail_1: "接尾",
    conjugated_form: "*"
  },
  {
    surface_form: "乾い",
    reading: "カワイ",
    pos: "動詞",
    pos_detail_1: "自立",
    conjugated_form: "連用タ接続"
  },
  {
    surface_form: "た",
    reading: "タ",
    pos: "助動詞",
    pos_detail_1: "*",
    conjugated_form: "基本形"
  },
  {
    surface_form: "雲",
    reading: "クモ",
    pos: "名詞",
    pos_detail_1: "一般",
    conjugated_form: "*"
  }
];

const merged = mergeTokensForRuby(tokens);
assert.deepEqual(
  merged.map((t) => t.surface_form),
  ["夏日", "乾いた", "雲"]
);
assert.equal(merged[0].reading, "なつび");
assert.equal(merged[1].reading, "かわいた");

const dictPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dict");
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: dictPath }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});

const html = buildFuriganaHtml("夏日乾いた雲", (text) => tokenizer.tokenize(text));
assert.ok(html.includes('data-surface="夏日"'), html);
assert.ok(html.includes('data-surface="乾いた"'), html);
assert.ok(html.includes('data-surface="雲"'), html);
assert.ok(!html.includes('data-surface="夏"'), html);
assert.ok(!html.includes('data-surface="乾い"'), html);

console.log("Token merge tests passed.");
console.log(html);
