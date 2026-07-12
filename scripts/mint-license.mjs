#!/usr/bin/env node
/**
 * ローカル / サーバーの licenses.json に Premium キーを追加する。
 * 使い方: node scripts/mint-license.mjs [note]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const note = process.argv[2] || "minted-via-cli";
const py = path.join(root, ".venv-reading", "bin", "python");

const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "reading-engine"))})
from reading_engine.premium import mint_license
print(json.dumps(mint_license(${JSON.stringify(note)}), ensure_ascii=False, indent=2))
`;

const result = spawnSync(py, ["-c", code], { encoding: "utf8", cwd: root });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "mint failed");
  process.exit(result.status || 1);
}
console.log(result.stdout);
