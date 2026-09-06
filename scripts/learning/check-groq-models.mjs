#!/usr/bin/env node
/**
 * CI helper: list Groq chat models and ensure synth roles can resolve.
 * Usage: node scripts/learning/check-groq-models.mjs /tmp/groq-verify.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGroqModelSet } from "./groq-models.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsPath = process.argv[2] || "/tmp/groq-verify.json";
const data = JSON.parse(readFileSync(modelsPath, "utf8"));
const ids = (data.data || [])
  .map((m) => m.id)
  .filter((id) => !/whisper|prompt-guard|orpheus/i.test(id))
  .sort();

console.log(ids.join("\n"));

const config = JSON.parse(
  readFileSync(path.join(__dirname, "synth-config.json"), "utf8")
);
const resolved = resolveGroqModelSet(config.groq, new Set(ids));
console.log(
  `Resolved: generator=${resolved.generator} verifier=${resolved.verifier} arbitrator=${resolved.arbitrator}`
);
if (resolved.swapped.length) {
  console.log("Swapped:", resolved.swapped.join("; "));
}

const hasQwen = ids.some((id) => id.startsWith("qwen/"));
console.log(
  hasQwen
    ? "Qwen family: present"
    : "Qwen family: absent (using gpt-oss verifier fallback if needed)"
);
