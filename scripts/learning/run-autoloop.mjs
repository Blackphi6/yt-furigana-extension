#!/usr/bin/env node
/**
 * Candidate-constrained pipeline autoloop.
 * Default cloud path is ¥0: Cloudflare Workers AI + ubuntu (no Mac).
 *
 *   --phase=smoke|synth|retrain|retrain-lite|full
 *   --provider=cloudflare|ollama
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = {
    phase: "full",
    perTarget: null,
    fast: false,
    skipSynth: false,
    writeBaseline: false,
    provider: process.env.LEARN_PROVIDER || "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--phase=")) args.phase = a.slice(8);
    else if (a === "--phase") args.phase = argv[++i];
    else if (a.startsWith("--per-target=")) args.perTarget = Number(a.slice(13));
    else if (a === "--per-target") args.perTarget = Number(argv[++i]);
    else if (a === "--fast") args.fast = true;
    else if (a === "--skip-synth") args.skipSynth = true;
    else if (a === "--write-baseline") args.writeBaseline = true;
    else if (a.startsWith("--provider=")) args.provider = a.slice(11);
    else if (a === "--provider") args.provider = argv[++i];
  }
  if (!args.provider) {
    if (process.env.GROQ_API_KEY) args.provider = "groq";
    else if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
      args.provider = "cloudflare";
    else args.provider = "ollama";
  }
  if (args.perTarget == null) {
    args.perTarget = args.provider === "ollama" ? 2 : 1;
  }
  return args;
}

function run(cmd, cmdArgs, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
    const child = spawn(cmd, cmdArgs, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function phaseSmoke(args) {
  await run("node", [
    "scripts/learning/llm-synth.mjs",
    "--dry-run",
    "--provider",
    args.provider,
  ]);
  await run("npm", ["run", "learn:bench"]);
  const benchArgs = ["scripts/learning/evaluate-three-benches.mjs"];
  if (args.writeBaseline) benchArgs.push("--write-baseline");
  await run("node", benchArgs);
}

async function phaseSynth(args) {
  const synthArgs = [
    "scripts/learning/llm-synth.mjs",
    "--provider",
    args.provider,
    "--per-target",
    String(args.perTarget),
  ];
  if (args.fast) synthArgs.push("--fast");
  await run("node", synthArgs, { LEARN_PROVIDER: args.provider });
  await run("node", ["scripts/learning/merge-synth-corpus.mjs"]);
}

async function phaseRetrainLite(args) {
  await run("node", ["scripts/learning/merge-synth-corpus.mjs"]);
  await run("npm", ["run", "learn"]);
  const benchArgs = ["scripts/learning/evaluate-three-benches.mjs"];
  if (args.writeBaseline) benchArgs.push("--write-baseline");
  await run("node", benchArgs);
}

async function phaseRetrain(args) {
  // Heavy path: needs local Python venv + GPU-ish Mac (optional)
  await phaseRetrainLite(args);
  await run(".venv-reading/bin/python", [
    "reading-engine/train/build_ndl_train.py",
    "--per-surface",
    "30",
  ]);
  await run(".venv-reading/bin/python", [
    "reading-engine/train/train_reranker.py",
    "--max-train-rows",
    "20000",
    "--epochs",
    "2",
    "--max-steps",
    "2000",
    "--batch-size",
    "2",
    "--min-holdout",
    "0.50",
    "--min-seed",
    "0.70",
  ]);
  const benchArgs = ["scripts/learning/evaluate-three-benches.mjs"];
  if (args.writeBaseline) benchArgs.push("--write-baseline");
  await run("node", benchArgs);
}

const args = parseArgs(process.argv.slice(2));
console.log(`=== autoloop phase=${args.phase} provider=${args.provider} ===`);

try {
  if (args.phase === "smoke") {
    await phaseSmoke(args);
  } else if (args.phase === "synth") {
    await phaseSynth(args);
  } else if (args.phase === "retrain-lite") {
    await phaseRetrainLite(args);
  } else if (args.phase === "retrain") {
    await phaseRetrain(args);
  } else if (args.phase === "full") {
    if (!args.skipSynth) await phaseSynth(args);
    await phaseRetrainLite(args);
  } else {
    throw new Error(`unknown phase: ${args.phase}`);
  }
  console.log("\n=== autoloop OK ===");
} catch (err) {
  console.error(`\n=== autoloop FAILED: ${err.message} ===`);
  process.exit(1);
}
