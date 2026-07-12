#!/usr/bin/env node
/**
 * 失敗した seed / inbox から読み提案を自動生成する。
 */
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  seedBenchPath,
  inboxPath,
  proposalsPath,
  learnedOverridesPath,
  learningLogPath
} from "./bench-utils.mjs";
import { buildFuriganaHtml } from "../../src/furigana.js";
import { extractReadingsFromRubyHtml } from "../../src/reading-learning.js";

const tokenize = await createBenchTokenizer();
const seedCases = await loadJsonl(seedBenchPath());
let learned = null;
try {
  learned = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
} catch {
  learned = null;
}

const bench = await runSeedBench(seedCases, tokenize, learned);
const proposals = [];
const ts = new Date().toISOString();

for (const detail of bench.details) {
  if (detail.ok) continue;
  for (const item of detail.results) {
    if (item.ok) continue;
    proposals.push({
      ts,
      kind: "proposal",
      id: detail.id,
      text: detail.text,
      surface: item.surface,
      reading: item.reading,
      got: item.got,
      source: "seed",
      cues: extractCues(detail.text, item.surface)
    });
  }
}

let inbox = [];
if (existsSync(inboxPath())) {
  try {
    inbox = await loadJsonl(inboxPath());
  } catch {
    inbox = [];
  }
}

for (const event of inbox) {
  if (event.kind === "user" && event.surface && event.want) {
    proposals.push({
      ts,
      kind: "proposal",
      text: event.text || "",
      surface: event.surface,
      reading: event.want,
      source: "user",
      cues: extractCues(event.text || "", event.surface)
    });
    continue;
  }

  if (!event.text || !event.surface || !event.reading) continue;

  const seedHit = seedCases.find(
    (seed) =>
      seed.text === event.text ||
      seed.expect?.some((e) => e.surface === event.surface)
  );
  if (seedHit) {
    const expect = seedHit.expect.find((e) => e.surface === event.surface);
    if (expect) {
      proposals.push({
        ts,
        kind: "proposal",
        text: event.text,
        surface: expect.surface,
        reading: expect.reading,
        source: "seed",
        cues: extractCues(event.text, expect.surface)
      });
    }
    continue;
  }

  proposals.push({
    ts,
    kind: "proposal",
    text: event.text,
    surface: event.surface,
    reading: event.reading,
    source: "runtime",
    cues: extractCues(event.text, event.surface)
  });
}

for (const event of inbox) {
  if (!event.text) continue;
  const html = buildFuriganaHtml(event.text, tokenize);
  const map = extractReadingsFromRubyHtml(html);
  for (const [surface, reading] of map) {
    if (
      event.surface &&
      surface !== event.surface &&
      !event.surface.startsWith(surface)
    ) {
      continue;
    }
    proposals.push({
      ts,
      kind: "proposal",
      text: event.text,
      surface: event.surface || surface,
      reading,
      source: "hybrid",
      cues: extractCues(event.text, event.surface || surface)
    });
  }
}

await mkdir(path.dirname(proposalsPath()), { recursive: true });
const body =
  proposals.map((row) => JSON.stringify(row)).join("\n") +
  (proposals.length ? "\n" : "");
await writeFile(proposalsPath(), body, "utf8");

await appendFile(
  learningLogPath(),
  `${JSON.stringify({
    ts,
    kind: "auto-label",
    proposalCount: proposals.length,
    seedFailures: bench.details.filter((d) => !d.ok).map((d) => d.id)
  })}\n`,
  "utf8"
);

console.log(
  `Auto-label: wrote ${proposals.length} proposals → data/learning/proposals.jsonl`
);

function extractCues(text, surface) {
  if (!text || !surface) return [];
  const idx = text.indexOf(surface);
  if (idx === -1) return [];
  const before = text.slice(Math.max(0, idx - 6), idx);
  const after = text.slice(idx + surface.length, idx + surface.length + 6);
  return [before, after].map((s) => s.trim()).filter((s) => s.length >= 2);
}
