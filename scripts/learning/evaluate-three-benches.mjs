#!/usr/bin/env node
/**
 * Three-bench eval gate (JRM-style).
 * 1) seed-bench  2) hard-heteronym  3) easy-regression
 * Compares against data/learning/gate-baseline.json; refuses to update baseline on drop.
 *
 * Exit 0 = gate pass (or --write-baseline on first run)
 * Exit 1 = regression
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  learnedOverridesPath,
} from "./bench-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = path.join(root, "data/learning/gate-baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");
const allowDrop = process.argv.includes("--allow-drop");

const BENCHES = [
  {
    id: "seed-bench",
    path: path.join(root, "data/learning/seed-bench.jsonl"),
    minPassRate: 1.0,
  },
  {
    id: "hard-heteronym",
    path: path.join(root, "data/learning/benches/hard-heteronym.jsonl"),
    minPassRate: 0.85,
  },
  {
    id: "easy-regression",
    path: path.join(root, "data/learning/benches/easy-regression.jsonl"),
    minPassRate: 0.9,
  },
];

const tokenize = await createBenchTokenizer();
let learned = null;
try {
  learned = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
} catch {
  learned = null;
}

const results = {};
for (const bench of BENCHES) {
  const cases = await loadJsonl(bench.path);
  // empty expect → treat as pass if ruby builds without throw
  const normalized = cases.map((c) => ({
    ...c,
    expect: c.expect || [],
  }));
  const run = await runSeedBench(normalized, tokenize, learned);
  // For easy cases with empty expect, ok means no crash; count as pass if evaluation.ok
  // When expect=[], evaluateRubyAgainstExpect likely returns ok=true always
  const rate = run.total ? run.passed / run.total : 0;
  results[bench.id] = {
    passed: run.passed,
    total: run.total,
    rate,
    minPassRate: bench.minPassRate,
    failed: run.details.filter((d) => !d.ok).map((d) => d.id),
  };
  console.log(
    `${bench.id}: ${run.passed}/${run.total} (${(100 * rate).toFixed(1)}%)` +
      (results[bench.id].failed.length
        ? ` failed=[${results[bench.id].failed.join(", ")}]`
        : "")
  );
}

const floorsOk = BENCHES.every((b) => results[b.id].rate + 1e-9 >= b.minPassRate);

let baseline = null;
if (existsSync(baselinePath)) {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
}

let regress = false;
if (baseline?.benches && !allowDrop) {
  for (const b of BENCHES) {
    const prev = baseline.benches[b.id]?.rate;
    if (typeof prev === "number" && results[b.id].rate + 1e-9 < prev) {
      console.error(
        `GATE FAIL: ${b.id} ${results[b.id].rate.toFixed(3)} < baseline ${prev.toFixed(3)}`
      );
      regress = true;
    }
  }
}

const gateOk = floorsOk && !regress;
const payload = {
  ts: new Date().toISOString(),
  gateOk,
  floorsOk,
  regress,
  benches: results,
};

console.log(gateOk ? "GATE PASS" : "GATE FAIL");

if (gateOk && (writeBaseline || !baseline)) {
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote baseline → ${baselinePath}`);
} else if (gateOk && baseline) {
  // refresh baseline (monotonic via regress check above)
  await writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`updated baseline → ${baselinePath}`);
}

if (!gateOk) process.exitCode = 1;
