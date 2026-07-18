#!/usr/bin/env node
/**
 * CI helper: list Groq chat models and ensure core IDs exist.
 * Usage: node scripts/learning/check-groq-models.mjs /tmp/groq-verify.json
 */
import { readFileSync } from "node:fs";

const path = process.argv[2] || "/tmp/groq-verify.json";
const data = JSON.parse(readFileSync(path, "utf8"));
const ids = (data.data || [])
  .map((m) => m.id)
  .filter((id) => !/whisper|prompt-guard|orpheus/i.test(id))
  .sort();

console.log(ids.join("\n"));

const need = ["llama-3.1-8b-instant", "openai/gpt-oss-20b"];
const missing = need.filter((id) => !ids.includes(id));
if (missing.length) {
  console.error("Missing required:", missing.join(", "));
  process.exit(1);
}

const hasQwen = ids.some((id) => id.startsWith("qwen/"));
console.log(
  hasQwen
    ? "Qwen family: present"
    : "Qwen family: absent (will use Llama verifier fallback)"
);
