import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSudachiTokenize } from "../../src/sudachi-tokenizer.js";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { buildFuriganaHtml } from "furigana-ruby-engine/lib/furigana.js";
import { applyLearnedOverridesNow } from "furigana-ruby-engine/lib/reading-context.js";
import { evaluateRubyAgainstExpect } from "furigana-ruby-engine/lib/reading-learning.js";
import { normalizeReading } from "furigana-ruby-engine/lib/reading-normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const unescapeHtml = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * ルビ HTML を [表記, 読み] の並びにする。ルビの外の文字は読み＝表記。
 * @param {string} html
 * @returns {{ text: string, reading: string }[]}
 */
function rubySegments(html) {
  const segments = [];
  const re = /<ruby>([\s\S]*?)<rt>([\s\S]*?)<\/rt><\/ruby>/g;
  let last = 0;
  let match;
  const pushPlain = (chunk) => {
    const text = unescapeHtml(chunk.replace(/<[^>]+>/g, ""));
    for (const ch of text) segments.push({ text: ch, reading: ch });
  };
  while ((match = re.exec(html))) {
    pushPlain(html.slice(last, match.index));
    const base = unescapeHtml(match[1].replace(/<[^>]+>/g, ""));
    segments.push({ text: base, reading: unescapeHtml(match[2].replace(/<[^>]+>/g, "")) });
    last = re.lastIndex;
  }
  pushPlain(html.slice(last));
  return segments;
}

/**
 * 文中の surface（at 番目の出現）に付いた読みを、ルビ単位でつないで返す。
 * ルビの区切りが語の途中で切れる（大人|気 など）ときは判定できないので null。
 * 既存の evaluateRubyAgainstExpect は部分一致・濁点の有無を同一視するので、
 * 連濁や「〜力」の読み分けを見るときはこちらを使う。
 * @param {string} html
 * @param {string} text
 * @param {string} surface
 * @param {number} [at]
 * @returns {string | null}
 */
export function readingOfSpan(html, text, surface, at = 0) {
  let start = -1;
  for (let i = 0, from = 0; i <= at; i += 1) {
    start = text.indexOf(surface, from);
    if (start < 0) return null;
    from = start + 1;
  }
  const end = start + surface.length;
  let pos = 0;
  let reading = "";
  for (const seg of rubySegments(String(html || ""))) {
    const segStart = pos;
    const segEnd = pos + seg.text.length;
    pos = segEnd;
    if (segEnd <= start || segStart >= end) continue;
    if (segStart < start || segEnd > end) return null;
    reading += seg.reading;
  }
  return reading ? normalizeReading(reading) : null;
}

export async function loadJsonl(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function createBenchTokenizer() {
  const bytes = new Uint8Array(
    await readFile(path.join(root, "node_modules/sudachi-wasm333/resources/system.dic"))
  );
  const sudachi = new SudachiStateless();
  sudachi.initialize_from_bytes(bytes);
  return createSudachiTokenize(sudachi, TokenizeMode.C);
}

/**
 * @param {object[]} seedCases
 * @param {((text: string) => any[]) | null} tokenize
 * @param {object | null} learned
 */
export async function runSeedBench(seedCases, tokenize, learned = null) {
  applyLearnedOverridesNow(learned || { phrases: {}, contextRules: [] });

  const details = [];
  let passed = 0;

  for (const seedCase of seedCases) {
    const html = buildFuriganaHtml(seedCase.text, tokenize);
    const evaluation = evaluateRubyAgainstExpect(html, seedCase.expect || []);
    if (evaluation.ok) passed += 1;
    details.push({
      id: seedCase.id,
      ok: evaluation.ok,
      text: seedCase.text,
      results: evaluation.results,
      html
    });
  }

  return { passed, total: seedCases.length, details };
}

export function seedBenchPath() {
  return path.join(root, "data/learning/seed-bench.jsonl");
}

export function learnedOverridesPath() {
  return path.join(root, "data/generated/learned-overrides.json");
}

export function inboxPath() {
  return path.join(root, "data/learning/inbox.jsonl");
}

export function proposalsPath() {
  return path.join(root, "data/learning/proposals.jsonl");
}

export function learningLogPath() {
  return path.join(root, "data/learning/learning-log.jsonl");
}
