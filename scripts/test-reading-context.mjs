import { resolveContextualReading, applyContextualReadings } from "../src/reading-context.js";
import { createSudachiTokenize } from "../src/sudachi-tokenizer.js";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { buildFuriganaHtml } from "../src/furigana.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const lyric = resolveContextualReading(
  "忙しい",
  "いそがしい",
  "よそ見する暇もない忙しい世界を"
);
if (lyric?.reading !== "せわしい") {
  throw new Error(`expected せわしい, got ${JSON.stringify(lyric)}`);
}

const work = resolveContextualReading(
  "忙しい",
  "いそがしい",
  "今日は仕事が忙しくて残業です"
);
if (work?.reading !== "いそがしい") {
  throw new Error(`expected いそがしい, got ${JSON.stringify(work)}`);
}

const bytes = new Uint8Array(
  await readFile(path.join(root, "node_modules/sudachi-wasm333/resources/system.dic"))
);
const sudachi = new SudachiStateless();
sudachi.initialize_from_bytes(bytes);
const tokenize = createSudachiTokenize(sudachi, TokenizeMode.C);

const text = "よそ見する暇もない忙しい世界を";
const raw = tokenize(text);
const adjusted = applyContextualReadings(raw, text);
const busy = adjusted.find((token) => token.surface_form === "忙しい");
if (busy?.reading !== "せわしい") {
  throw new Error(`Sudachi+context should yield せわしい, got ${busy?.reading}`);
}

const html = buildFuriganaHtml(text, tokenize);
if (!html.includes("<rt>せわ</rt>")) {
  throw new Error(`expected せわ ruby, got ${html}`);
}
if (html.includes("<rt>いそが</rt>")) {
  throw new Error(`should not keep いそが, got ${html}`);
}

const one = buildFuriganaHtml("1人の夜", tokenize);
if (!one.includes("<ruby>1人<rt>ひとり</rt></ruby>")) {
  throw new Error(`Sudachi split should remain for 1人, got ${one}`);
}

console.log("Hybrid reading tests passed.");
console.log(html);
console.log(one);
