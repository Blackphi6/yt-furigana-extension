import kuromoji from "kuromoji";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFuriganaHtml, buildRuby } from "../src/furigana.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dictPath = path.join(__dirname, "..", "dict");

const cases = [
  { surface: "向かい", reading: "ムカイ", expected: "<ruby>向<rt>む</rt></ruby>かい" },
  { surface: "食べる", reading: "タベル", expected: "<ruby>食<rt>た</rt></ruby>べる" },
  { surface: "行く", reading: "イク", expected: "<ruby>行<rt>い</rt></ruby>く" },
  { surface: "日本語", reading: "ニホンゴ", expected: "<ruby>日本語<rt>にほんご</rt></ruby>" },
  { surface: "取り扱い", reading: "トリアツカイ", expected: "<ruby>取<rt>と</rt></ruby>り<ruby>扱<rt>あつか</rt></ruby>い" }
];

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

for (const testCase of cases) {
  const actual = buildRuby(testCase.surface, testCase.reading);
  assertEqual(actual, testCase.expected, testCase.surface);
}

assertEqual(
  buildRuby("時々", "ときどき"),
  "<ruby>時々<rt>ときどき</rt></ruby>",
  "時々"
);
assertEqual(
  buildRuby("人々", "ひとびと"),
  "<ruby>人々<rt>ひとびと</rt></ruby>",
  "人々"
);

assertEqual(
  buildRuby("カツアゲ放題", "かつあげほうだい"),
  "カツアゲ<ruby>放題<rt>ほうだい</rt></ruby>",
  "カツアゲ放題"
);
assertEqual(
  buildRuby("カツアゲ放題", "ほうだい"),
  "カツアゲ<ruby>放題<rt>ほうだい</rt></ruby>",
  "カツアゲ放題 partial reading"
);

// XSS: 字幕表層・読みを HTML エスケープする
assertEqual(
  buildRuby("<img src=x onerror=alert(1)>日", "にち"),
  "<ruby>&lt;img src=x onerror=alert(1)&gt;日<rt>にち</rt></ruby>",
  "escape surface with tags"
);
assertEqual(
  buildRuby("日", "<img src=x>"),
  "<ruby>日<rt>&lt;img src=x&gt;</rt></ruby>",
  "escape reading with tags"
);
const xssWrap = buildFuriganaHtml("<b>日</b>", () => [
  { surface_form: "<b>日</b>", reading: "ニチ", pronunciation: "ニチ" }
]);
if (xssWrap.includes("<b>") || !xssWrap.includes("&lt;b&gt;")) {
  throw new Error(`wrap must escape surface HTML: ${xssWrap}`);
}

const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: dictPath }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});

const sentence = "向かって食べる";
const html = buildFuriganaHtml(sentence, (text) => tokenizer.tokenize(text));
if (!html.includes("<ruby>向<rt>む</rt></ruby>かっ") || !html.includes('data-surface="向かっ"')) {
  throw new Error(`sentence conversion failed: ${html}`);
}
if (!html.includes("<ruby>食<rt>た</rt></ruby>べる") || !html.includes("yt-furigana-word")) {
  throw new Error(`sentence conversion failed: ${html}`);
}

// 読みが無くても漢字はクリック登録できる（辞書結合で「随に」単位になる想定）
const unsetHtml = buildFuriganaHtml("随に生きる", () => [
  { surface_form: "随", reading: "", pronunciation: "" },
  { surface_form: "に", reading: "ニ", pronunciation: "ニ" },
  { surface_form: "生きる", reading: "イキル", pronunciation: "イキル" }
]);
if (
  !unsetHtml.includes('data-surface="随に"') ||
  !unsetHtml.includes("yt-furigana-word--unset") ||
  !unsetHtml.includes('data-reading=""')
) {
  throw new Error(`unset kanji should be wrap-clickable: ${unsetHtml}`);
}

console.log("All furigana tests passed.");
console.log(html);
console.log(unsetHtml);
