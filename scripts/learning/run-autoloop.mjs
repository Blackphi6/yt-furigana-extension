#!/usr/bin/env node
/**
 * Full JRM-style autoloop (local or self-hosted Actions):
 *   synth → merge corpus → (optional) rule learn → ndl-build → ndl-train → 3-bench gate
 *
 * Usage:
 *   node scripts/learning/run-autoloop.mjs --phase=synth
 *   node scripts/learning/run-autoloop.mjs --phase=retrain
 *   node scripts/learning/run-autoloop.mjs --phase=full
 *   node scripts/learning/run-autoloop.mjs --phase=smoke
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const args = {
    phase: "full",
    perTarget: 2,
    fast: false,
    skipSynth: false,
    writeBaseline: false,
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
  await run("npm", ["run", "learn:synth:dry"]);
  await run("npm", ["run", "learn:bench"]);
  const benchArgs = ["scripts/learning/evaluate-three-benches.mjs"];
  if (args.writeBaseline) benchArgs.push("--write-baseline");
  await run("node", benchArgs);
}

async function phaseSynth(args) {
  const synthArgs = [
    "scripts/learning/llm-synth.mjs",
    "--per-target",
    String(args.perTarget),
  ];
  if (args.fast) synthArgs.push("--fast");
  await run("node", synthArgs);
  await run("node", ["scripts/learning/merge-synth-corpus.mjs"]);
}

async function phaseRetrain(args) {
  await run("node", ["scripts/learning/merge-synth-corpus.mjs"]);
  await run("npm", ["run", "learn"]);
  // Prefer existing NDL cache; build merges synth-open via train script seed paths
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
console.log(`=== autoloop phase=${args.phase} ===`);

try {
  if (args.phase === "smoke") {
    await phaseSmoke(args);
  } else if (args.phase === "synth") {
    await phaseSynth(args);
  } else if (args.phase === "retrain") {
    await phaseRetrain(args);
  } else if (args.phase === "full") {
    if (!args.skipSynth) await phaseSynth(args);
    await phaseRetrain(args);
  } else {
    throw new Error(`unknown phase: ${args.phase}`);
  }
  console.log("\n=== autoloop OK ===");
} catch (err) {
  console.error(`\n=== autoloop FAILED: ${err.message} ===`);
  process.exit(1);
}
