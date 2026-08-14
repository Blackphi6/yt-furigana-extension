#!/usr/bin/env node
import assert from "node:assert/strict";
import { parseYomiBenchRows } from "./eval/yomi-bench-parse.mjs";

const rows = [
  {
    input:
      '質問で指定された漢字の読みを「ひらがな」だけで答えてください。回答に対する解説は不要です。\n\n質問:「国旗」という単語の「旗」という漢字の読みをひらがなで答えて下さい。\n答えは：',
    output: "き"
  },
  {
    input:
      '質問で指定された漢字の読みを「ひらがな」だけで答えてください。回答に対する解説は不要です。\n\n質問:「易しい」という単語の「易」という漢字の読みをひらがなで答えて下さい。\n答えは：',
    output: "やさ"
  }
];

const items = parseYomiBenchRows(rows);
assert.equal(items.length, 2);
assert.deepEqual(items[0], {
  id: "yomi-1",
  surface: "国旗",
  target: "旗",
  reading_expected: "き"
});
assert.deepEqual(items[1], {
  id: "yomi-2",
  surface: "易しい",
  target: "易",
  reading_expected: "やさ"
});

console.log("test-yomi-bench-parse: ok");
