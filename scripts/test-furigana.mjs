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

console.log("All furigana tests passed.");
console.log(html);
