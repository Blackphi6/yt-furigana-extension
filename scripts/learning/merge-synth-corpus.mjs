#!/usr/bin/env node
/**
 * Merge ephemeral synth-accepted.jsonl into tracked corpus/synth-open.jsonl.
 * Dedupes by (text, surface, gold). Never invents readings.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const acceptedPath = path.join(root, "data/learning/synth-accepted.jsonl");
const corpusPath = path.join(root, "data/learning/corpus/synth-open.jsonl");

function keyOf(row) {
  return `${row.text}\0${row.surface}\0${row.gold}`;
}

async function loadJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const accepted = await loadJsonl(acceptedPath);
const existing = await loadJsonl(corpusPath);
const map = new Map();
for (const row of existing) {
  if (row?.text && row?.surface && row?.gold) map.set(keyOf(row), row);
}
let added = 0;
for (const row of accepted) {
  if (!row?.text || !row?.surface || !row?.gold) continue;
  if (!(row.candidates || []).includes(row.gold)) continue;
  const k = keyOf(row);
  if (map.has(k)) continue;
  map.set(k, {
    text: row.text,
    surface: row.surface,
    candidates: row.candidates,
    gold: row.gold,
    source: row.source || "llm-synth",
    note: row.note || "",
  });
  added += 1;
}

await mkdir(path.dirname(corpusPath), { recursive: true });
const lines = [...map.values()].map((r) => JSON.stringify(r)).join("\n");
await writeFile(corpusPath, lines ? `${lines}\n` : "", "utf8");
console.log(
  `synth corpus: total=${map.size} added=${added} from_accepted=${accepted.length} → ${corpusPath}`
);
