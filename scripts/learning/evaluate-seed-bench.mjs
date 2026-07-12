#!/usr/bin/env node
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  seedBenchPath,
  learnedOverridesPath,
  learningLogPath
} from "./bench-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const tokenize = await createBenchTokenizer();
const seedCases = await loadJsonl(seedBenchPath());
let learned = null;
try {
  learned = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
} catch {
  learned = null;
}

const result = await runSeedBench(seedCases, tokenize, learned);
const summary = {
  ts: new Date().toISOString(),
  kind: "seed-bench",
  passed: result.passed,
  total: result.total,
  failed: result.details.filter((d) => !d.ok).map((d) => d.id)
};

console.log(
  `Seed bench: ${result.passed}/${result.total}` +
    (summary.failed.length ? ` failed=[${summary.failed.join(", ")}]` : " OK")
);

for (const detail of result.details) {
  if (detail.ok) continue;
  console.log(`  - ${detail.id}: ${detail.text}`);
  for (const item of detail.results) {
    console.log(`      expect ${item.surface}=${item.reading} got=${item.got}`);
  }
}

await mkdir(path.dirname(learningLogPath()), { recursive: true });
await appendFile(learningLogPath(), `${JSON.stringify(summary)}\n`, "utf8");

if (result.passed < result.total) {
  process.exitCode = 1;
}
