#!/usr/bin/env node
/** reranker 蒸留提案を heteronym-cue-seed にマージ（ゲート付き） */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const proposalsPath = path.join(
  root,
  "data/learning/reranker-distill-proposals.json"
);
const seedPath = path.join(root, "data/learning/heteronym-cue-seed.json");

const proposals = JSON.parse(await readFile(proposalsPath, "utf8"));
let seed = [];
try {
  seed = JSON.parse(await readFile(seedPath, "utf8"));
} catch {
  seed = [];
}

function mergeRule(rules, rule) {
  const surface = String(rule.surface || "").trim();
  const reading = String(rule.reading || "").trim();
  if (!surface || !reading) return;
  const cues = [...new Set((rule.cues || []).map(String).filter(Boolean))];
  const hit = rules.find((r) => r.surface === surface && r.reading === reading);
  if (hit) {
    hit.cues = [...new Set([...(hit.cues || []), ...cues])];
    hit.weight = Math.max(hit.weight || 3, rule.weight || 4);
    return;
  }
  rules.push({ surface, reading, weight: rule.weight ?? 4, cues });
}

for (const p of proposals) {
  mergeRule(seed, p);
}

await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
console.log(`merged ${proposals.length} proposals → ${seedPath}`);
