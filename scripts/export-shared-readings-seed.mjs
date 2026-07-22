#!/usr/bin/env node
/**
 * learned-overrides.json の phrases だけを共有読みシードに書き出す。
 * 字幕・長い文脈は含めない（surface → reading のみ）。
 *
 * Usage:
 *   node scripts/export-shared-readings-seed.mjs
 *   node scripts/export-shared-readings-seed.mjs --publish
 *   YT_FURIGANA_ADMIN_TOKEN=... YT_FURIGANA_PUBLISH_URL=https://... \
 *     node scripts/export-shared-readings-seed.mjs --publish
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const overridesPath = path.join(root, "data/generated/learned-overrides.json");
const seedPath = path.join(root, "data/generated/shared-readings-seed.json");

const SURFACE_RE =
  /^[\u3400-\u9fff\uF900-\uFAFF々〻\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$/;
const READING_RE = /^[\u3040-\u309f\u30a0-\u30ffーゝゞヽヾ]+$/;

function isValidPair(surface, reading) {
  const s = String(surface || "").trim();
  const r = String(reading || "").trim();
  if (!s || !r || s.length > 32 || r.length > 48) return false;
  return SURFACE_RE.test(s) && READING_RE.test(r);
}

/**
 * @param {unknown} overrides
 * @returns {Record<string, string>}
 */
export function phrasesFromLearnedOverrides(overrides) {
  const out = {};
  if (!overrides || typeof overrides !== "object") return out;
  const phrases = /** @type {{ phrases?: Record<string, string> }} */ (overrides)
    .phrases;
  if (!phrases || typeof phrases !== "object") return out;
  for (const [surface, reading] of Object.entries(phrases)) {
    if (!isValidPair(surface, reading)) continue;
    out[String(surface).trim()] = String(reading).trim();
  }
  return out;
}

async function main() {
  const publish = process.argv.includes("--publish");
  const replace = process.argv.includes("--replace");

  if (!existsSync(overridesPath)) {
    console.error(`Missing ${overridesPath}`);
    process.exit(1);
  }

  const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
  const entries = phrasesFromLearnedOverrides(overrides);
  const payload = {
    entries,
    revisedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    source: "learned-overrides",
    note: "phrases only — no caption/lyrics text"
  };

  await mkdir(path.dirname(seedPath), { recursive: true });
  await writeFile(seedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(entries).length} entries → ${seedPath}`);

  if (!publish) return;

  const token = String(process.env.YT_FURIGANA_ADMIN_TOKEN || "").trim();
  const base = String(
    process.env.YT_FURIGANA_PUBLISH_URL ||
      process.env.PUBLIC_READING_API_URL ||
      "https://yt-furigana-readings.onrender.com"
  )
    .trim()
    .replace(/\/+$/, "");

  if (!token) {
    console.error("YT_FURIGANA_ADMIN_TOKEN required for --publish");
    process.exit(1);
  }

  const url = `${base}/v1/admin/shared-readings-seed`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminToken: token,
      entries,
      replace
    })
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`Publish failed ${response.status}: ${text}`);
    process.exit(1);
  }
  console.log(`Published to ${url}`);
  console.log(text);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
