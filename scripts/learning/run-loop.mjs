#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(script, { allowFail = false } = {}) {
  console.log(`\n>>> ${script}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: "inherit"
  });
  const status = result.status ?? 1;
  if (status !== 0 && !allowFail) {
    process.exitCode = status;
  }
  return status;
}

// 初期ベンチ失敗は学習の材料なので許容
run("evaluate-seed-bench.mjs", { allowFail: true });
run("auto-label.mjs");
const promoteStatus = run("promote.mjs", { allowFail: true });
const finalStatus = run("evaluate-seed-bench.mjs");

if (promoteStatus === 0 && finalStatus === 0) {
  console.log("\nLearning loop finished. Rebuild extension: npm run build");
} else if (finalStatus === 0) {
  console.log("\nLearning loop finished (no new promotions or promote no-op).");
} else {
  console.log("\nLearning loop finished with remaining bench failures.");
  process.exitCode = finalStatus;
}
