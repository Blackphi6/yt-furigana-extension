import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  buildCombinedUserDict,
  collectLocalPhraseHits,
  mergeSpansWithLocalPhrases
} from "../src/phrase-hits.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { readingApiSpansToHtml } from "../src/reading-api.js";

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

const dict = buildCombinedUserDict(text, { 辛い: "からい", 東海林: "しょうじ" });
assert.equal(dict["鬼滅の刃"], "きめつのやいば");
assert.equal(dict["辛い"], "からい");
assert.equal(dict["東海林"], "しょうじ");

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

console.log("phrase-hits / dict+API combo tests passed.");
