import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  buildCombinedUserDict,
  collectLocalPhraseHits,
  mergeSpansWithLocalPhrases
} from "furigana-ruby-engine/lib/phrase-hits.js";
import { installNeologdPhrasesForTests } from "furigana-ruby-engine/lib/neologd-phrases.js";
import { readingApiSpansToHtml } from "furigana-ruby-engine/lib/reading-api.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phrases = JSON.parse(
  gunzipSync(
    readFileSync(path.join(repo, "data", "generated", "neologd-phrases.json.gz"))
  ).toString("utf8")
);
installNeologdPhrasesForTests(phrases);

const text = "鬼滅の刃で辛いラーメンを食べた";
const hits = collectLocalPhraseHits(text, { 辛い: "からい" });
assert.ok(hits.some((h) => h.surface === "鬼滅の刃"));
assert.ok(hits.some((h) => h.surface === "辛い" && h.reading === "からい"));

const dict = buildCombinedUserDict(text, { 辛い: "からい", 葛飾: "かつしか" });
assert.equal(dict["鬼滅の刃"], "きめつのやいば");
assert.equal(dict["辛い"], "からい");
assert.equal(dict["葛飾"], "かつしか");

const original = "今日は鬼滅の刃を見た";
const apiSpans = [
  { start: 3, end: 4, surface: "鬼", reading: "おに", source: "api" },
  { start: 4, end: 5, surface: "滅", reading: "めつ", source: "api" }
];
const merged = mergeSpansWithLocalPhrases(original, apiSpans, {});
assert.ok(merged.some((s) => s.surface === "鬼滅の刃" && s.reading === "きめつのやいば"));

const html = readingApiSpansToHtml(
  original,
  [
    { surface: "鬼", span: [3, 4], reading: "おに" },
    { surface: "滅", span: [4, 5], reading: "めつ" }
  ],
  {}
);
assert.match(html, /data-surface="鬼滅の刃"/);
assert.match(html, /data-reading="きめつのやいば"/);

// API の語の途中で切れる辞書句は使わない（例: 大|人気 に人名「大人」を被せない）
const crossing = mergeSpansWithLocalPhrases(
  original,
  [{ start: 6, end: 8, surface: "刃を", reading: "はを", source: "api" }],
  {}
);
assert.ok(!crossing.some((s) => s.surface === "鬼滅の刃"), "API 語をまたぐ句は捨てる");
assert.ok(crossing.some((s) => s.surface === "刃を"));
// ユーザー登録はまたいでも優先する
const userCrossing = mergeSpansWithLocalPhrases(
  original,
  [{ start: 6, end: 8, surface: "刃を", reading: "はを", source: "api" }],
  { 鬼滅の刃: "きめつのやいば" }
);
assert.ok(userCrossing.some((s) => s.surface === "鬼滅の刃" && s.source === "manual"));

console.log("phrase-hits / dict+API combo tests passed.");
