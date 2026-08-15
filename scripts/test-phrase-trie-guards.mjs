#!/usr/bin/env node
/**
 * phrase-trie-guards の自己チェック + JVS 代表例。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isUnsafePlaceParticlePhrase,
  PERSONAL_NAME_SURFACE_BLOCKLIST,
  PHRASE_TRIE_OVERRIDES,
  PRODUCT_READING_OVERRIDES
} from "../src/phrase-trie-guards.js";
import { createBenchTokenizer } from "./learning/bench-utils.mjs";
import { buildFuriganaHtml } from "../src/furigana.js";
import { normalizeReading } from "../src/reading-normalize.js";
import { installNeologdPhrasesForTests } from "../src/neologd-phrases.js";
import { installUnidicPhrasesForTests } from "../src/unidic-phrases.js";
import { installJoyoJukujiPhrasesForTests } from "../src/joyo-jukuji-phrases.js";
import { installJaFuriganaPhrasesForTests } from "../src/ja-furigana-phrases.js";
import { installWikidataKanaPhrasesForTests } from "../src/wikidata-kana-phrases.js";
import { installSudachiFullPhrasesForTests } from "../src/sudachi-full-phrases.js";
import { installPlaceNamePhrasesForTests } from "../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../src/station-phrases.js";
import { installCorporateNamePhrasesForTests } from "../src/corporate-name-phrases.js";
import {
  installPersonalNamePhrasesForTests,
  rebuildCombinedPhraseTrie
} from "../src/personal-name-phrases.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(isUnsafePlaceParticlePhrase("中の"), true);
assert.equal(isUnsafePlaceParticlePhrase("魚の"), true);
assert.equal(isUnsafePlaceParticlePhrase("靖国神社"), false);
assert.ok(PERSONAL_NAME_SURFACE_BLOCKLIST.has("三時"));
assert.equal(PHRASE_TRIE_OVERRIDES["靖国神社"], "やすくにじんじゃ");
assert.equal(PRODUCT_READING_OVERRIDES["旗色"], "はたいろ");
assert.equal(PRODUCT_READING_OVERRIDES["類人猿"], "るいじんえん");

function loadGz(rel) {
  return JSON.parse(
    gunzipSync(readFileSync(path.join(root, rel))).toString("utf8")
  );
}

function loadFullPhraseDicts() {
  installNeologdPhrasesForTests(loadGz("dict/neologd-phrases.json.gz"));
  installUnidicPhrasesForTests(loadGz("dict/unidic-phrases.json.gz"));
  installJoyoJukujiPhrasesForTests(loadGz("dict/joyo-jukuji-phrases.json.gz"));
  installJaFuriganaPhrasesForTests(loadGz("dict/ja-furigana-phrases.json.gz"));
  installWikidataKanaPhrasesForTests(loadGz("dict/wikidata-kana-phrases.json.gz"));
  installSudachiFullPhrasesForTests(loadGz("dict/sudachi-full-phrases.json.gz"));
  installPlaceNamePhrasesForTests(loadGz("dict/place-name-phrases.json.gz"));
  installStationPhrasesForTests(loadGz("dict/station-phrases.json.gz"));
  installCorporateNamePhrasesForTests({});
  installPersonalNamePhrasesForTests(loadGz("dict/personal-name-phrases.json.gz"));
  rebuildCombinedPhraseTrie();
}

function htmlToReadingString(html) {
  let s = String(html || "");
  s = s.replace(/<span\b[^>]*\byt-furigana-word\b[^>]*>[\s\S]*?<\/span>/gi, (block) => {
    const surface = /data-surface="([^"]*)"/.exec(block)?.[1] ?? "";
    const readingRaw = /data-reading="([^"]*)"/.exec(block)?.[1] ?? "";
    const reading = normalizeReading(readingRaw);
    return reading || surface;
  });
  s = s.replace(/<ruby>[\s\S]*?<rt>([\s\S]*?)<\/rt><\/ruby>/gi, (_, rt) =>
    normalizeReading(rt.replace(/<[^>]+>/g, ""))
  );
  return s.replace(/<[^>]+>/g, "");
}

const cases = [
  {
    text: "魚の骨がつかえて、息が詰まりそうだった。",
    want: "さかなのほね"
  },
  {
    text: "２月２７日の三時から、１時間くらい会うことにしませんか。",
    want: "さんじから"
  },
  {
    text: "一列に立ち並んだ家が、新しいアパートに席を譲るために、とりこわされつつある。",
    want: "いちれつに"
  },
  {
    text: "警戒中の警官が、遠くのぼんやりとした影に気づいた。",
    want: "けいかいちゅうの"
  },
  {
    text: "昨日飲みすぎたため、二日酔いで頭がガンガンした。",
    want: "ふつかよい"
  },
  {
    text: "昭和天皇が、靖国神社で７５年までに、戦後、計、８回参拝した。",
    want: "やすくにじんじゃ"
  }
];

loadFullPhraseDicts();
const tokenize = await createBenchTokenizer();
for (const c of cases) {
  const got = htmlToReadingString(buildFuriganaHtml(c.text, tokenize));
  assert.ok(got.includes(c.want), `${c.text}\n  want fragment: ${c.want}\n  got: ${got}`);
}

console.log("test-phrase-trie-guards: ok");
