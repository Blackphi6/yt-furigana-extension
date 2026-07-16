import assert from "node:assert/strict";
import { arpabetToKatakana, englishWordToKatakana } from "../src/arpabet-katakana.js";
import {
  applyEnglishKatakanaReadings,
  installEnglishKatakanaDictForTests,
  lookupEnglishKatakana
} from "../src/english-katakana-reading.js";
import { buildFuriganaHtml } from "../src/furigana.js";

// You / know
assert.equal(arpabetToKatakana("Y UW1"), "ユー");
assert.equal(arpabetToKatakana(["N", "OW1"]), "ノウ");
assert.equal(arpabetToKatakana("Y AE1"), "イェア");
assert.equal(arpabetToKatakana("HH AE1 P IY0 N AH0 S"), "ハピネス");
assert.equal(arpabetToKatakana("L AH1 V"), "ラブ");
assert.equal(arpabetToKatakana("HH AH0 L OW1"), "ハロー");
assert.equal(arpabetToKatakana("HH AE1 B AH0 T"), "ハビット");
assert.equal(arpabetToKatakana("R AE1 B AH0 T"), "ラビット");
assert.equal(arpabetToKatakana("L IH1 M AH0 T"), "リミット");
assert.equal(arpabetToKatakana("K R EH1 D AH0 T"), "クレジット");

const mini = {
  you: "ユー",
  know: "ノウ",
  yeah: "イェア",
  happiness: "ハピネス",
  love: "ラブ"
};
installEnglishKatakanaDictForTests(mini);
assert.equal(lookupEnglishKatakana("You"), "ユー");
assert.equal(lookupEnglishKatakana("HAPPINESS"), "ハピネス");

const tokens = applyEnglishKatakanaReadings([
  { surface_form: "You", reading: "You" },
  { surface_form: " ", reading: "" },
  { surface_form: "know", reading: "know" },
  { surface_form: "happiness", reading: "happiness" },
  { surface_form: "100W", reading: "ヒャクワット", preserveKatakana: true, _numberUnit: true }
]);
assert.equal(tokens[0].reading, "ユー");
assert.equal(tokens[0].preserveKatakana, true);
assert.equal(tokens[2].reading, "ノウ");
assert.equal(tokens[3].reading, "ハピネス");
assert.equal(tokens[4].reading, "ヒャクワット"); // 数字単位は触らない

const html = buildFuriganaHtml("You know", () => [
  { surface_form: "You", reading: "You" },
  { surface_form: " ", reading: "" },
  { surface_form: "know", reading: "know" }
]);
assert.ok(html.includes("<rt>ユー</rt>"));
assert.ok(html.includes("<rt>ノウ</rt>"));

// phones 直変換のスモーク
assert.equal(
  englishWordToKatakana("food", { food: ["F", "UW1", "D"] }),
  "フード"
);

console.log("English katakana / CMUdict rule tests passed.");
