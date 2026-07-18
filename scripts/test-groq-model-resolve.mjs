import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveGroqModelSet } from "./learning/groq-models.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  await readFile(path.join(__dirname, "learning/synth-config.json"), "utf8")
);

const primary = resolveGroqModelSet(
  config.groq,
  new Set([
    "llama-3.1-8b-instant",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
  ])
);
assert.equal(primary.generator, "llama-3.1-8b-instant");
assert.equal(primary.verifier, "qwen/qwen3.6-27b");
assert.equal(primary.arbitrator, "openai/gpt-oss-20b");
assert.deepEqual(primary.swapped, []);

const withoutQwen = resolveGroqModelSet(
  config.groq,
  new Set([
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
  ])
);
assert.equal(withoutQwen.verifier, "llama-3.3-70b-versatile");
assert.ok(withoutQwen.swapped.some((s) => s.includes("verifier")));

assert.throws(
  () => resolveGroqModelSet(config.groq, new Set(["whisper-large-v3"])),
  /generator/
);

assert.equal(config.groq.models.verifier.id, "qwen/qwen3.6-27b");
assert.notEqual(config.groq.models.verifier.id, "qwen/qwen3-32b");

// sanity: main guard path shape
assert.ok(pathToFileURL(path.join(__dirname, "learning/llm-synth.mjs")).href);

console.log("Groq model resolve tests passed.");
