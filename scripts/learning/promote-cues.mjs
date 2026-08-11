/**
 * キュレート同形異音キューを learned-overrides にマージし、
 * synth-open コーパスから高頻出 (surface,reading) を提案として足す。
 * seed-bench / hard-heteronym が悪化したら書き込まない。
 */
import { readFile, writeFile, copyFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  seedBenchPath,
  learnedOverridesPath,
  learningLogPath
} from "./bench-utils.mjs";
import {
  emptyLearnedOverrides,
  passesPromotionGate
} from "../../src/reading-learning.js";
import { normalizeReading } from "../../src/reading-normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const seedPath = path.join(root, "data/learning/heteronym-cue-seed.json");
const corpusPath = path.join(root, "data/learning/corpus/synth-open.jsonl");
const contribCorpusPath = path.join(
  root,
  "data/learning/corpus/contributions.jsonl"
);
const hardPath = path.join(root, "data/learning/benches/hard-heteronym.jsonl");

function mergePhrase(map, surface, reading) {
  const s = String(surface || "").trim();
  const r = normalizeReading(reading);
  if (!s || !r) return;
  map[s] = r;
}

function mergeRule(rules, rule) {
  const surface = String(rule?.surface || "").trim();
  const reading = normalizeReading(rule?.reading);
  if (!surface || !reading) return;
  const cues = [...new Set((rule.cues || []).map(String).filter(Boolean))];
  const existing = rules.find(
    (r) => r.surface === surface && normalizeReading(r.reading) === reading
  );
  if (existing) {
    existing.cues = [...new Set([...(existing.cues || []), ...cues])];
    existing.weight = Math.max(existing.weight || 3, rule.weight || 3);
    return;
  }
  rules.push({
    surface,
    reading,
    weight: rule.weight ?? 4,
    cues
  });
}

/** synth コーパスから surface+reading が複数回出たものを cue ルール化 */
function harvestCorpusRules(rows, { minCount = 3 } = {}) {
  /** @type {Map<string, { count: number, cues: Set<string>, reading: string, surface: string }>} */
  const bag = new Map();
  for (const row of rows) {
    const surface = String(row.surface || "").trim();
    const reading = normalizeReading(row.gold || row.reading || "");
    const text = String(row.text || "");
    if (!surface || !reading || !text.includes(surface)) continue;
    if (surface.length > 4) continue;
    const key = `${surface}\t${reading}`;
    let hit = bag.get(key);
    if (!hit) {
      hit = { count: 0, cues: new Set(), reading, surface };
      bag.set(key, hit);
    }
    hit.count += 1;
    // 表層を含む短いスニペットを cue に
    const idx = text.indexOf(surface);
    if (idx >= 0) {
      const snippet = text.slice(Math.max(0, idx - 2), idx + surface.length + 2).trim();
      if (snippet.length >= surface.length + 1) hit.cues.add(snippet);
    }
    if (row.note) {
      for (const part of String(row.note).split(/[／/、]/)) {
        const p = part.trim();
        if (p.includes(surface) && p.length <= 16) hit.cues.add(p);
      }
    }
  }

  const out = [];
  for (const hit of bag.values()) {
    if (hit.count < minCount) continue;
    if (hit.cues.size === 0) continue;
    out.push({
      surface: hit.surface,
      reading: hit.reading,
      weight: 3,
      cues: [...hit.cues].slice(0, 12)
    });
  }
  return out;
}

const tokenize = await createBenchTokenizer();
const seedCases = await loadJsonl(seedBenchPath());
const hardCases = existsSync(hardPath) ? await loadJsonl(hardPath) : [];

let current = emptyLearnedOverrides();
if (existsSync(learnedOverridesPath())) {
  current = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
}

const draft = {
  version: 1,
  updatedAt: new Date().toISOString(),
  phrases: { ...(current.phrases || {}) },
  contextRules: [...(current.contextRules || [])].map((r) => ({
    ...r,
    cues: [...(r.cues || [])]
  }))
};

const cueSeed = JSON.parse(await readFile(seedPath, "utf8"));
for (const [surface, reading] of Object.entries(cueSeed.phrases || {})) {
  mergePhrase(draft.phrases, surface, reading);
}
for (const rule of cueSeed.contextRules || []) {
  mergeRule(draft.contextRules, rule);
}

let corpusRows = [];
if (existsSync(corpusPath)) {
  corpusRows = await loadJsonl(corpusPath);
}
const harvested = harvestCorpusRules(corpusRows, { minCount: 3 });
for (const rule of harvested) mergeRule(draft.contextRules, rule);

// 匿名訂正の票集計（表層→読み）。文脈なしなので phrases のみ
let contribPhrases = 0;
if (existsSync(contribCorpusPath)) {
  const contribRows = await loadJsonl(contribCorpusPath);
  for (const row of contribRows) {
    const surface = String(row.surface || "").trim();
    const reading = normalizeReading(row.gold || row.reading || "");
    const votes = Number(row.votes) || 0;
    if (!surface || !reading || votes < 1) continue;
    // 既に phrases がある表層は上書きしない（cue seed / 既存学習を優先）
    if (draft.phrases[surface]) continue;
    mergePhrase(draft.phrases, surface, reading);
    contribPhrases += 1;
  }
}

const beforeSeed = await runSeedBench(seedCases, tokenize, current);
const afterSeed = await runSeedBench(seedCases, tokenize, draft);
const beforeHard = hardCases.length
  ? await runSeedBench(hardCases, tokenize, current)
  : { passed: 0, total: 0 };
const afterHard = hardCases.length
  ? await runSeedBench(hardCases, tokenize, draft)
  : { passed: 0, total: 0 };

const seedOk = passesPromotionGate(beforeSeed, afterSeed);
const hardOk =
  hardCases.length === 0 ||
  (afterHard.passed >= beforeHard.passed &&
    afterHard.passed / Math.max(afterHard.total, 1) >= 0.85);

console.log(
  `seed ${beforeSeed.passed}/${beforeSeed.total} → ${afterSeed.passed}/${afterSeed.total} (${seedOk ? "ok" : "FAIL"})`
);
console.log(
  `hard ${beforeHard.passed}/${beforeHard.total} → ${afterHard.passed}/${afterHard.total} (${hardOk ? "ok" : "FAIL"})`
);
console.log(
  `merged phrases=${Object.keys(draft.phrases).length} rules=${draft.contextRules.length} harvested=${harvested.length} contribPhrases=${contribPhrases}`
);

if (!seedOk || !hardOk) {
  await appendFile(
    learningLogPath(),
    `${JSON.stringify({
      ts: new Date().toISOString(),
      kind: "promote-cues-reject",
      beforeSeed,
      afterSeed,
      beforeHard,
      afterHard,
      harvested: harvested.length
    })}\n`
  );
  process.exitCode = 1;
  process.exit();
}

await mkdir(path.dirname(learnedOverridesPath()), { recursive: true });
const backup = learnedOverridesPath().replace(/\.json$/, ".bak.json");
if (existsSync(learnedOverridesPath())) {
  await copyFile(learnedOverridesPath(), backup);
}
await writeFile(learnedOverridesPath(), `${JSON.stringify(draft, null, 2)}\n`);
await appendFile(
  learningLogPath(),
  `${JSON.stringify({
    ts: new Date().toISOString(),
    kind: "promote-cues-accept",
    phrases: Object.keys(draft.phrases).length,
    contextRules: draft.contextRules.length,
    harvested: harvested.length,
    afterSeed,
    afterHard
  })}\n`
);
console.log(`Updated ${learnedOverridesPath()}`);
