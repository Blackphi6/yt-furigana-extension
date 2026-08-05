#!/usr/bin/env node
/**
 * Export synth-log (+ corpus) → site/data/lattice-feed.json（運用ラティス・ビューア用）
 *
 *   node scripts/learning/write-lattice-feed.mjs
 *
 * Pages サイズ対策: 末尾 MAX_ENTRIES、raw は RAW_MAX 文字で truncate。
 * synth-log を優先し、足りない分を corpus/synth-open.jsonl で埋める。
 */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadJsonl } from "./bench-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const logPath = path.join(root, "data/learning/synth-log.jsonl");
const corpusPath = path.join(root, "data/learning/corpus/synth-open.jsonl");
const siteDataDir = path.join(root, "site/data");
const outPath = path.join(siteDataDir, "lattice-feed.json");

export const MAX_ENTRIES = 800;
export const RAW_MAX = 400;

const SECRET_KEY_RE = /api[_-]?key|token|secret|authorization|bearer/i;

/**
 * @param {unknown} value
 * @param {number} max
 */
export function truncateRaw(value, max = RAW_MAX) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/**
 * @param {Record<string, unknown>} row
 */
function stripSecrets(row) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (SECRET_KEY_RE.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * @param {unknown} row
 * @param {string} [fallbackSource]
 */
export function normalizeLatticeEntry(row, fallbackSource = "") {
  if (!row || typeof row !== "object") return null;
  const raw = stripSecrets(/** @type {Record<string, unknown>} */ (row));
  const text = String(raw.text || "").trim();
  const surface = String(raw.surface || "").trim();
  if (!text || !surface) return null;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  const gold = String(raw.gold || "").trim();
  if (!candidates.length && gold) candidates.push(gold);
  return {
    ts: String(raw.ts || ""),
    text,
    surface,
    candidates,
    gold,
    verify_guess:
      raw.verify_guess == null || raw.verify_guess === ""
        ? null
        : String(raw.verify_guess),
    arbitrate_guess:
      raw.arbitrate_guess == null || raw.arbitrate_guess === ""
        ? null
        : String(raw.arbitrate_guess),
    source: String(raw.source || fallbackSource || "").trim(),
    verify_raw: truncateRaw(raw.verify_raw),
    arb_raw: truncateRaw(raw.arb_raw),
    generator: String(raw.generator || "").trim(),
    verifier: String(raw.verifier || "").trim(),
    arbitrator: String(raw.arbitrator || "").trim(),
    note: String(raw.note || "").trim(),
  };
}

function entryKey(e) {
  return `${e.surface}\0${e.text}`;
}

/**
 * @param {object[]} logRows
 * @param {object[]} corpusRows
 * @param {{ maxEntries?: number }} [opts]
 */
export function buildLatticeFeed(logRows, corpusRows = [], opts = {}) {
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  /** @type {Map<string, object>} */
  const map = new Map();

  for (const row of corpusRows || []) {
    const e = normalizeLatticeEntry(row, "corpus");
    if (!e) continue;
    map.set(entryKey(e), e);
  }
  // synth-log を後勝ち（verify/arb 付きを優先）
  for (const row of logRows || []) {
    const e = normalizeLatticeEntry(row);
    if (!e) continue;
    const prev = map.get(entryKey(e));
    map.set(entryKey(e), prev ? { ...prev, ...e, note: e.note || prev.note } : e);
  }

  const normalized = [...map.values()];
  // ts が空のコーパス行は末尾扱い
  normalized.sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  const total = normalized.length;
  const slice = normalized.slice(-maxEntries);
  /** @type {Record<string, number>} */
  const bySource = {};
  for (const e of slice) {
    const key = e.source || "(none)";
    bySource[key] = (bySource[key] || 0) + 1;
  }
  slice.reverse();
  return {
    ts: new Date().toISOString(),
    generatedFrom: "synth-log.jsonl+corpus/synth-open.jsonl",
    summary: {
      total,
      shown: slice.length,
      logCount: (logRows || []).length,
      corpusCount: (corpusRows || []).length,
      bySource,
    },
    entries: slice,
  };
}

export async function writeLatticeFeed() {
  await mkdir(siteDataDir, { recursive: true });
  const logRows = existsSync(logPath) ? await loadJsonl(logPath) : [];
  const corpusRows = existsSync(corpusPath) ? await loadJsonl(corpusPath) : [];
  const feed = buildLatticeFeed(logRows, corpusRows);
  await writeFile(outPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  console.log(
    `lattice-feed: total=${feed.summary.total} shown=${feed.summary.shown} (log=${feed.summary.logCount} corpus=${feed.summary.corpusCount}) → ${outPath}`
  );
  return feed;
}

async function main() {
  await writeLatticeFeed();
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("write-lattice-feed.mjs");

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
