import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSudachiTokenize } from "../../src/sudachi-tokenizer.js";
import { SudachiStateless, TokenizeMode } from "sudachi-wasm333";
import { buildFuriganaHtml } from "../../src/furigana.js";
import { applyLearnedOverridesNow } from "../../src/reading-context.js";
import { evaluateRubyAgainstExpect } from "../../src/reading-learning.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

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
