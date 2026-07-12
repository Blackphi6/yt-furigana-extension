import kuromoji from "kuromoji";
import { createSudachiTokenize } from "../src/sudachi-tokenizer.js";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { buildFuriganaHtml } from "../src/furigana.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const CASES = [
  "1人の夜に中身を広げようとして",
  "一人の夜",
  "忙しい世界を",
  "減らそうとして",
  "表に出る"
];

const dicBytes = new Uint8Array(
  await readFile(path.join(root, "node_modules/sudachi-wasm333/resources/system.dic"))
);
const sudachi = new SudachiStateless();
sudachi.initialize_from_bytes(dicBytes);
const sudachiTokenize = createSudachiTokenize(sudachi, TokenizeMode.C);

const kuromojiTokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: path.join(root, "dict") }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});

let failed = 0;

for (const text of CASES) {
  const sTokens = sudachiTokenize(text);
  const kTokens = kuromojiTokenizer.tokenize(text);
  const sHtml = buildFuriganaHtml(text, sudachiTokenize);
  const kHtml = buildFuriganaHtml(text, (value) => kuromojiTokenizer.tokenize(value));

  console.log(`\n=== ${text}`);
  console.log("Sudachi:", sTokens.map((t) => `${t.surface_form}/${t.reading}`).join(" "));
  console.log("Kuromoji:", kTokens.map((t) => `${t.surface_form}/${t.reading || "?"}`).join(" "));
  console.log("Sudachi ruby:", sHtml);
  console.log("Kuromoji ruby:", kHtml);
}

const onePerson = sudachiTokenize("1人の夜");
if (onePerson[0]?.surface_form !== "1人" || !/ヒトリ|ひとり/i.test(onePerson[0]?.reading || "")) {
  console.error("FAIL: Sudachi should read 1人 as ヒトリ");
  failed += 1;
} else {
  console.log("\nOK: Sudachi reads 1人 as ヒトリ");
}

const html = buildFuriganaHtml("1人の夜", sudachiTokenize);
if (!html.includes("<ruby>1人<rt>ひとり</rt></ruby>")) {
  console.error(`FAIL: expected <ruby>1人<rt>ひとり</rt></ruby>, got ${html}`);
  failed += 1;
} else {
  console.log("OK: Sudachi furigana for 1人:", html);
}

if (failed > 0) process.exit(1);
console.log("\nSudachi comparison tests passed.");
