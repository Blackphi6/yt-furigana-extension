#!/usr/bin/env node
/**
 * Daily / on-demand learning report for site + git history.
 *
 *   node scripts/learning/write-daily-report.mjs [--mode=synth|retrain|manual|smoke]
 *
 * Always writes reports (even if gate floors fail). Exit 0 unless I/O fails.
 * Does not update gate-baseline.json (retrain uses learn:gate --write-baseline).
 */
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
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
const corpusPath = path.join(root, "data/learning/corpus/synth-open.jsonl");
const acceptedPath = path.join(root, "data/learning/synth-accepted.jsonl");
const rejectedPath = path.join(root, "data/learning/synth-rejected.jsonl");
const baselinePath = path.join(root, "data/learning/gate-baseline.json");
const reportsDir = path.join(root, "data/learning/reports");
const latestPath = path.join(reportsDir, "latest.json");
const historyPath = path.join(reportsDir, "history.jsonl");
const siteDataDir = path.join(root, "site/data");
const siteReportPath = path.join(siteDataDir, "learning-report.json");
const siteHistoryPath = path.join(siteDataDir, "learning-history.json");

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

function parseMode(argv) {
  let mode = "manual";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--mode=")) mode = a.slice(7);
    else if (a === "--mode") mode = argv[++i] || mode;
  }
  return mode;
}

async function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function countJsonl(filePath) {
  if (!existsSync(filePath)) return 0;
  const raw = await readFile(filePath, "utf8");
  return raw.split("\n").filter((l) => l.trim()).length;
}

function overridesSummary(learned) {
  if (!learned || typeof learned !== "object") {
    return { phraseCount: 0, contextRuleCount: 0 };
  }
  return {
    phraseCount: Object.keys(learned.phrases || {}).length,
    contextRuleCount: Array.isArray(learned.contextRules)
      ? learned.contextRules.length
      : 0,
  };
}

function benchDelta(current, baseline) {
  const out = {};
  for (const id of Object.keys(current || {})) {
    const cur = current[id];
    const prev = baseline?.benches?.[id];
    out[id] = {
      rate: cur.rate,
      passed: cur.passed,
      total: cur.total,
      baselineRate: typeof prev?.rate === "number" ? prev.rate : null,
      deltaRate:
        typeof prev?.rate === "number" ? cur.rate - prev.rate : null,
    };
  }
  return out;
}

async function runBenches(learned) {
  const tokenize = await createBenchTokenizer();
  const results = {};
  for (const bench of BENCHES) {
    const cases = await loadJsonl(bench.path);
    const normalized = cases.map((c) => ({
      ...c,
      expect: c.expect || [],
    }));
    const run = await runSeedBench(normalized, tokenize, learned);
    const rate = run.total ? run.passed / run.total : 0;
    results[bench.id] = {
      passed: run.passed,
      total: run.total,
      rate,
      minPassRate: bench.minPassRate,
      failed: run.details.filter((d) => !d.ok).map((d) => d.id),
    };
  }
  const floorsOk = BENCHES.every(
    (b) => results[b.id].rate + 1e-9 >= b.minPassRate
  );
  return { results, floorsOk };
}

async function collectNewSamples(corpusDelta, acceptedCount) {
  const accepted = existsSync(acceptedPath) ? await loadJsonl(acceptedPath) : [];
  if (acceptedCount > 0 && accepted.length) {
    return accepted.slice(-Math.min(10, accepted.length)).map((r) => ({
      text: r.text,
      surface: r.surface,
      gold: r.gold,
      source: r.source || "",
      note: r.note || "",
    }));
  }
  if (corpusDelta > 0) {
    const corpus = await loadJsonl(corpusPath);
    return corpus.slice(-Math.min(10, corpusDelta)).map((r) => ({
      text: r.text,
      surface: r.surface,
      gold: r.gold,
      source: r.source || "",
      note: r.note || "",
    }));
  }
  return [];
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const previous = await readJson(latestPath, null);
  const baseline = await readJson(baselinePath, null);
  const learned = await readJson(learnedOverridesPath(), null);
  const overrideNow = overridesSummary(learned);
  const overridePrev = previous?.overrides || null;
  const overridesChanged = previous
    ? overrideNow.phraseCount !== (overridePrev?.phraseCount ?? 0) ||
      overrideNow.contextRuleCount !== (overridePrev?.contextRuleCount ?? 0)
    : false;

  const corpusCount = await countJsonl(corpusPath);
  const prevCorpus = previous?.corpus?.total ?? null;
  const corpusDelta =
    prevCorpus == null ? 0 : corpusCount - prevCorpus;
  const acceptedCount = await countJsonl(acceptedPath);
  const rejectedCount = await countJsonl(rejectedPath);

  const { results, floorsOk } = await runBenches(learned);
  let regress = false;
  if (baseline?.benches) {
    for (const b of BENCHES) {
      const prev = baseline.benches[b.id]?.rate;
      if (typeof prev === "number" && results[b.id].rate + 1e-9 < prev) {
        regress = true;
      }
    }
  }
  const gateOk = floorsOk && !regress;
  const useAccepted =
    mode === "synth" || mode === "retrain" || mode === "full" || corpusDelta > 0;
  const newSamples = useAccepted
    ? await collectNewSamples(Math.max(corpusDelta, 0), acceptedCount)
    : [];

  const noteParts = [];
  if (corpusDelta > 0) noteParts.push(`素材 +${corpusDelta}`);
  else noteParts.push("素材増なし");
  if (overridesChanged) noteParts.push("本体ルール変化あり");
  else noteParts.push("本体ルール変化なし（日次は主に素材集め）");

  const report = {
    ts: new Date().toISOString(),
    mode,
    note: noteParts.join(" / "),
    gateOk,
    floorsOk,
    regress,
    corpus: {
      total: corpusCount,
      delta: corpusDelta,
      acceptedThisRun: acceptedCount,
      rejectedThisRun: rejectedCount,
    },
    benches: results,
    vsBaseline: benchDelta(results, baseline),
    overrides: {
      ...overrideNow,
      changed: overridesChanged,
    },
    newSamples,
  };

  await mkdir(reportsDir, { recursive: true });
  await mkdir(siteDataDir, { recursive: true });
  await writeFile(latestPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await appendFile(historyPath, `${JSON.stringify(report)}\n`, "utf8");

  let history = [];
  if (existsSync(historyPath)) {
    const raw = await readFile(historyPath, "utf8");
    history = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  const recent = history.slice(-60);
  await writeFile(siteReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    siteHistoryPath,
    `${JSON.stringify({ updatedAt: report.ts, entries: recent }, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `report mode=${mode} gate=${gateOk ? "PASS" : "FAIL"} corpus=${corpusCount} (Δ${corpusDelta >= 0 ? "+" : ""}${corpusDelta}) samples=${newSamples.length}`
  );
  for (const b of BENCHES) {
    const r = results[b.id];
    console.log(
      `  ${b.id}: ${r.passed}/${r.total} (${(100 * r.rate).toFixed(1)}%)`
    );
  }
  console.log(`wrote ${latestPath}`);
  console.log(`wrote ${siteReportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
