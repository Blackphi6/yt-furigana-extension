#!/usr/bin/env node
/**
 * proposals を集計し、seed-bench が悪化しないときだけ learned-overrides を更新する。
 */
import { readFile, writeFile, copyFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  seedBenchPath,
  proposalsPath,
  learnedOverridesPath,
  learningLogPath
} from "./bench-utils.mjs";
import {
  aggregatePromotionCandidates,
  applyPromotionCandidates,
  emptyLearnedOverrides,
  passesPromotionGate
} from "../../src/reading-learning.js";

const tokenize = await createBenchTokenizer();
const seedCases = await loadJsonl(seedBenchPath());

let current = emptyLearnedOverrides();
if (existsSync(learnedOverridesPath())) {
  current = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
}

const before = await runSeedBench(seedCases, tokenize, current);

if (!existsSync(proposalsPath())) {
  console.log("No proposals.jsonl — run npm run learn:label first.");
  process.exit(0);
}

const proposals = await loadJsonl(proposalsPath());
const candidates = aggregatePromotionCandidates(proposals, { minVotes: 2 });
if (candidates.length === 0) {
  console.log("No promotion candidates (need seed/user or >=2 votes).");
  process.exit(0);
}

const draft = applyPromotionCandidates(current, candidates);
const after = await runSeedBench(seedCases, tokenize, draft);
const ok = passesPromotionGate(before, after);

const ts = new Date().toISOString();
await mkdir(path.dirname(learnedOverridesPath()), { recursive: true });

console.log(
  `Promote gate: before ${before.passed}/${before.total} → after ${after.passed}/${after.total} → ${
    ok ? "ACCEPT" : "REJECT"
  }`
);
console.log(
  "Candidates:",
  candidates.map((c) => `${c.type}:${c.surface}=${c.reading}`).join(", ")
);

if (!ok) {
  await appendFile(
    learningLogPath(),
    `${JSON.stringify({
      ts,
      kind: "promote-reject",
      before: { passed: before.passed, total: before.total },
      after: { passed: after.passed, total: after.total },
      candidates
    })}\n`,
    "utf8"
  );
  process.exitCode = 1;
  process.exit();
}

const backup = learnedOverridesPath().replace(/\.json$/, ".bak.json");
if (existsSync(learnedOverridesPath())) {
  await copyFile(learnedOverridesPath(), backup);
}
await writeFile(learnedOverridesPath(), `${JSON.stringify(draft, null, 2)}\n`, "utf8");

await appendFile(
  learningLogPath(),
  `${JSON.stringify({
    ts,
    kind: "promote-accept",
    before: { passed: before.passed, total: before.total },
    after: { passed: after.passed, total: after.total },
    phrases: Object.keys(draft.phrases || {}),
    contextRules: (draft.contextRules || []).length
  })}\n`,
  "utf8"
);

console.log(`Updated ${learnedOverridesPath()}`);

// Free 向け共有パック用シードも更新（字幕なし・phrases のみ）
{
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const exporter = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "export-shared-readings-seed.mjs"
  );
  const result = spawnSync(process.execPath, [exporter], { stdio: "inherit" });
  if (result.status !== 0) {
    console.warn("shared-readings seed export failed (non-fatal)");
  }
}
