import assert from "node:assert/strict";
import {
  normalizeReading,
  normalizeUserReading,
  isValidUserReading
} from "../src/reading-normalize.js";
import { buildRuby, buildFuriganaHtml, isLatinWord, isRegisterableSurface } from "../src/furigana.js";

assert.equal(normalizeReading("オンリー"), "おんりー");
assert.equal(normalizeUserReading("オンリー"), "オンリー");
assert.equal(normalizeUserReading("おんりー"), "おんりー");
assert.equal(normalizeUserReading("うぃーくえんど"), "うぃーくえんど");
assert.equal(normalizeUserReading("ウィークエンド"), "ウィークエンド");
assert.equal(normalizeUserReading("うぃークエンド"), "ウィークエンド");

assert.equal(isValidUserReading("オンリー"), true);
assert.equal(isValidUserReading("ウィークエンド"), true);
assert.equal(isValidUserReading("abc"), false);

assert.equal(isLatinWord("Only"), true);
assert.equal(isRegisterableSurface("Only"), true);
assert.equal(isRegisterableSurface("週末"), true);
assert.equal(isRegisterableSurface("3"), true);
assert.equal(isRegisterableSurface("2.1"), true);
assert.equal(isRegisterableSurface("93%"), true);

// 数字に同一表記のふりがなは付けない
assert.equal(buildRuby("3", "3"), "3");
assert.equal(buildRuby("3", "さん"), "3");
assert.equal(buildRuby("2.1", "にてんいち"), "2.1");
assert.equal(buildRuby("360", "さんびゃくろくじゅう"), "360");
assert.equal(buildRuby("1人", "ひとり"), "<ruby>1人<rt>ひとり</rt></ruby>");

const threeHtml = buildFuriganaHtml("3", () => [
  { surface_form: "3", reading: "サン", pronunciation: "サン" }
]);
assert.ok(threeHtml.includes('data-surface="3"'));
assert.ok(threeHtml.includes("yt-furigana-word--tip"));
assert.ok(threeHtml.includes('data-tip="さん"'));
assert.equal(threeHtml.includes("<rt>"), false);

assert.equal(
  buildRuby("週末", "ウィークエンド", { preserveKatakana: true }),
  "<ruby>週末<rt>ウィークエンド</rt></ruby>"
);
assert.equal(
  buildRuby("Only", "オンリー", { preserveKatakana: true }),
  "<ruby>Only<rt>オンリー</rt></ruby>"
);
// 欧文のかな読みはカタカナ表示（You know → ユー / ノウ）
assert.equal(buildRuby("You", "ゆー"), "<ruby>You<rt>ユー</rt></ruby>");
assert.equal(buildRuby("know", "のう"), "<ruby>know<rt>ノウ</rt></ruby>");
assert.equal(buildRuby("You", "ユー"), "<ruby>You<rt>ユー</rt></ruby>");
// 欧文に同じ英字のふりがなは付けない
assert.equal(buildRuby("happiness", "happiness"), "happiness");
assert.equal(buildRuby("yeah", "yeah"), "yeah");
assert.equal(buildRuby("Yeah", "Yeah"), "Yeah");
assert.equal(buildRuby("yeah", ""), "yeah");
assert.equal(
  buildRuby("happiness", "ハピネス", { preserveKatakana: true }),
  "<ruby>happiness<rt>ハピネス</rt></ruby>"
);
assert.equal(
  buildRuby("happiness", "はぴねす"),
  "<ruby>happiness<rt>ハピネス</rt></ruby>"
);

const latinHtml = buildFuriganaHtml("one happiness yeah", () => [
  { surface_form: "one", reading: "one", pronunciation: "one" },
  { surface_form: " ", reading: "", pronunciation: "" },
  { surface_form: "happiness", reading: "happiness", pronunciation: "happiness" },
  { surface_form: " ", reading: "", pronunciation: "" },
  { surface_form: "yeah", reading: "yeah", pronunciation: "yeah" }
]);
assert.equal(latinHtml.includes("<rt>"), false);
assert.ok(latinHtml.includes('data-surface="happiness"'));
assert.ok(latinHtml.includes("yt-furigana-word--unset"));

const youKnowHtml = buildFuriganaHtml("You know", () => [
  { surface_form: "You", reading: "ユー", pronunciation: "ユー" },
  { surface_form: " ", reading: "", pronunciation: "" },
  { surface_form: "know", reading: "ノウ", pronunciation: "ノウ" }
]);
assert.ok(youKnowHtml.includes("<rt>ユー</rt>"));
assert.ok(youKnowHtml.includes("<rt>ノウ</rt>"));
assert.equal(youKnowHtml.includes("<rt>ゆー</rt>"), false);

// 形態素のカタカナ読みは従来どおりひらがな表示（漢字）
assert.equal(
  buildRuby("向かい", "ムカイ"),
  "<ruby>向<rt>む</rt></ruby>かい"
);

console.log("Katakana / Latin reading registration tests passed.");
