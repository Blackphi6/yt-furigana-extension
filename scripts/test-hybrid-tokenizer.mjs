import { mergeSudachiAndKuromoji, createHybridTokenize } from "../src/hybrid-tokenizer.js";
import { createSudachiTokenize } from "../src/sudachi-tokenizer.js";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { buildFuriganaHtml } from "../src/furigana.js";
import kuromoji from "kuromoji";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const bytes = new Uint8Array(
  await readFile(path.join(root, "node_modules/sudachi-wasm333/resources/system.dic"))
);
const sudachi = new SudachiStateless();
sudachi.initialize_from_bytes(bytes);
const sudachiTokenize = createSudachiTokenize(sudachi, TokenizeMode.C);

const kuromojiTokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: path.join(root, "dict") }).build((error, built) => {
    if (error) reject(error);
    else resolve(built);
  });
});
const kuromojiTokenize = (text) => kuromojiTokenizer.tokenize(text);
const hybridTokenize = createHybridTokenize(sudachiTokenize, kuromojiTokenize);

const one = mergeSudachiAndKuromoji(
  sudachiTokenize("1人の夜"),
  kuromojiTokenize("1人の夜")
);
if (one[0]?.surface_form !== "1人" || one[0]?.reading !== "ひとり") {
  throw new Error(`hybrid should keep Sudachi 1人/ひとり, got ${JSON.stringify(one[0])}`);
}

const html = buildFuriganaHtml("1人の夜に中身を広げようとして", hybridTokenize);
if (!html.includes("<ruby>1人<rt>ひとり</rt></ruby>")) {
  throw new Error(`hybrid ruby failed: ${html}`);
}

const lyric = buildFuriganaHtml("よそ見する暇もない忙しい世界を", hybridTokenize);
if (!lyric.includes("<rt>せわ</rt>")) {
  throw new Error(`hybrid+context should still yield せわしい: ${lyric}`);
}

console.log("Hybrid tokenizer tests passed.");
console.log(html);
console.log(lyric);
