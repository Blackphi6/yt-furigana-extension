// 読み API の応答から作る HTML で、原文がエスケープされること（チャット本文由来の XSS 防止）
import assert from "node:assert/strict";
import { parseReadingApiResponse } from "../src/reading-api.js";
import { parseReadingApiResponseLite } from "../extensions/yt-superchat-furigana/src/reading-api-lite.js";

const attack = '<img src=x onerror=prompt>生米&"';
const start = attack.indexOf("生米");
const spanPayload = {
  tokens: [{ surface: "生米", span: [start, start + 2], reading: "なまごめ" }]
};
// 全文を覆うトークン列（表層に記号や英字を含む）
const fullPayload = {
  tokens: [
    { surface: "<b>", reading: "" },
    { surface: "漢字", reading: "かんじ" },
    { surface: "</b>", reading: "" }
  ]
};

for (const [name, parse] of [
  ["src/reading-api.js", parseReadingApiResponse],
  ["yt-superchat-furigana reading-api-lite.js", parseReadingApiResponseLite]
]) {
  const spanHtml = parse(spanPayload, attack);
  assert.doesNotMatch(spanHtml, /<img/, `${name}: span 外の原文がエスケープされること`);
  assert.match(spanHtml, /&lt;img src=x onerror=prompt&gt;/, name);
  assert.match(spanHtml, /<rt>なまごめ<\/rt>/, `${name}: 読みは残ること`);

  const fullHtml = parse(fullPayload, "<b>漢字</b>");
  assert.doesNotMatch(fullHtml, /<b>/, `${name}: 表層の記号もエスケープされること`);
  assert.match(fullHtml, /<rt>かんじ<\/rt>/, name);
}

console.log("読み API エスケープのテスト: 問題なし");
