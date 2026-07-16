#!/usr/bin/env node
/**
 * CMUdict を取得し、英単語 → カタカナ JSON.gz を生成する。
 *
 * 出典: The Carnegie Mellon Pronouncing Dictionary (CMUdict)
 * License: BSD-2-Clause — commercial use unrestricted with attribution.
 * https://github.com/cmusphinx/cmudict
 *
 * Usage: node scripts/build-english-katakana.mjs
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { arpabetToKatakana } from "../src/arpabet-katakana.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const vendorDir = path.join(root, "data", "vendor");
const outDir = path.join(root, "data", "generated");
const cmudictPath = path.join(vendorDir, "cmudict.dict");
const outJson = path.join(outDir, "english-katakana.json");
  const outGz = path.join(outDir, "english-katakana.json.gz");
  const outMeta = path.join(outDir, "english-katakana.meta.json");

const CMUDICT_URL =
  "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict";

async function ensureCmudict() {
  mkdirSync(vendorDir, { recursive: true });
  if (existsSync(cmudictPath)) {
    console.log(`Using cached ${cmudictPath}`);
    return;
  }
  console.log(`Downloading CMUdict from ${CMUDICT_URL}`);
  const res = await fetch(CMUDICT_URL);
  if (!res.ok) throw new Error(`CMUdict download failed: ${res.status}`);
  const text = await res.text();
  await writeFile(cmudictPath, text, "utf8");
  console.log(`Saved ${cmudictPath} (${(text.length / 1024).toFixed(0)} KB)`);
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function buildKatakanaDict(text) {
  /** @type {Record<string, string>} */
  const out = {};
  let lines = 0;
  for (const line of text.split(/\n/)) {
    if (!line || line.startsWith(";;;") || line.startsWith("#")) continue;
    // WORD  PH1 PH2...   or WORD(1)  PH...
    const m = line.match(/^([A-Za-z][A-Za-z0-9'.\-]*)(?:\(\d+\))?\s+(.+)$/);
    if (!m) continue;
    const word = m[1].toLowerCase();
    // 異発音は最初の表記を優先（すでにあればスキップ）
    if (out[word]) continue;
    const phones = m[2].trim().split(/\s+/);
    const kata = arpabetToKatakana(phones);
    if (!kata || !/[\u30a0-\u30ff]/.test(kata)) continue;
    out[word] = kata;
    lines += 1;
  }
  console.log(`Converted ${lines} entries`);
  return out;
}

async function main() {
  await ensureCmudict();
  const text = await readFile(cmudictPath, "utf8");
  const dict = buildKatakanaDict(text);

  mkdirSync(outDir, { recursive: true });
  const json = `${JSON.stringify(dict)}\n`;
  await writeFile(outJson, json, "utf8");

  await pipeline(
    Readable.from([json]),
    createGzip({ level: 9 }),
    createWriteStream(outGz)
  );

  const meta = {
    source: "CMU Pronouncing Dictionary (cmusphinx/cmudict)",
    license: "BSD-2-Clause",
    attribution: "Copyright (C) 1993-2015 Carnegie Mellon University",
    licenseFile: "third_party/BSD-CMUdict.txt",
    conversion: "src/arpabet-katakana.js (MIT)",
    count: Object.keys(dict).length,
    generatedAt: new Date().toISOString()
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const { statSync } = await import("node:fs");
  const mb = statSync(outGz).size / (1024 * 1024);
  console.log(`Wrote ${outGz} (${mb.toFixed(2)} MB gz, ${Object.keys(dict).length} words)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
