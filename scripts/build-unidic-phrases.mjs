#!/usr/bin/env node
/**
 * 現代書き言葉 UniDic（lex.csv）から漢語名詞フレーズを抽出する。
 *
 * - 表層が漢字のみ・長さ 2〜8
 * - 品詞: 名詞（固有名詞は除外 → 地名/人名/NEologd に任せる）
 * - 読み: kana（なければ語彙素読み lForm）→ ひらがな化
 *
 * ライセンス: GPL / LGPL / 修正 BSD のトリプル → 本派生は BSD-3-Clause で帰属
 * 出典: 国立国語研究所 UniDic 3.1.1（現代書き言葉）
 * https://clrd.ninjal.ac.jp/unidic/
 *
 * Usage: node scripts/build-unidic-phrases.mjs
 */

import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, "data", ".cache", "unidic");
const lexPath = path.join(cacheDir, "lex_3_1.csv");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "unidic-phrases.json");
const outGz = path.join(outDir, "unidic-phrases.json.gz");
const outMeta = path.join(outDir, "unidic-phrases.meta.json");
const outSiteJson = path.join(outDir, "unidic-phrases-site.json");

const LEX_URL =
  "https://clrd.ninjal.ac.jp/unidic_archive/cwj/3.1.1/unidic-cwj-3.1.1/lex_3_1.csv";

const ONLY_KANJI = /^[\u3400-\u9fff\uF900-\uFAFF々〆〇]+$/;
const KATA = /^[\u30a1-\u30f6ー]+$/;

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function cleanReading(raw) {
  const h = toHiragana(String(raw || "").normalize("NFKC").trim());
  if (!h || !/^[\u3041-\u309fー]+$/.test(h)) return "";
  return h;
}

/** 簡易 CSV 1 行分割（UniDic lex はクォートなし想定） */
function splitCsvLine(line) {
  return line.split(",");
}

async function ensureLex() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(lexPath) && statSync(lexPath).size > 100_000_000) {
    console.log(`Using cached ${lexPath}`);
    return;
  }
  console.log(`Downloading UniDic lex_3_1.csv…`);
  const res = await fetch(LEX_URL);
  if (!res.ok) throw new Error(`UniDic download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(lexPath));
  console.log(`Saved ${(statSync(lexPath).size / 1024 / 1024).toFixed(0)} MB`);
}

async function buildPhrases() {
  /** @type {Record<string, string>} */
  const phrases = {};
  let rows = 0;
  let skippedProper = 0;

  const rl = createInterface({
    input: createReadStream(lexPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line) continue;
    rows += 1;
    const cols = splitCsvLine(line);
    const surface = cols[0] || "";
    if (surface.length < 2 || surface.length > 8) continue;
    if (!ONLY_KANJI.test(surface)) continue;
    if (phrases[surface]) continue;

    const pos1 = cols[4] || "";
    const pos2 = cols[5] || "";
    if (pos1 !== "名詞") continue;
    if (pos2 === "固有名詞") {
      skippedProper += 1;
      continue;
    }

    const kana = cols[24] || "";
    const lForm = cols[10] || "";
    const readingRaw = KATA.test(kana) ? kana : lForm;
    const reading = cleanReading(readingRaw);
    if (!reading) continue;
    phrases[surface] = reading;
  }

  console.log(
    `Rows ${rows}; phrases ${Object.keys(phrases).length}; skipped proper ${skippedProper}`
  );
  return phrases;
}

async function writeJsonGz(jsonPath, gzPath, data) {
  mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(data);
  await writeFile(jsonPath, text, "utf8");
  await pipeline(
    Readable.from([text]),
    createGzip({ level: 9 }),
    createWriteStream(gzPath)
  );
  return Buffer.byteLength(text);
}

async function main() {
  await ensureLex();
  const phrases = await buildPhrases();
  const bytes = await writeJsonGz(outJson, outGz, phrases);

  // Pages 用: 先頭から件数制限（デモ用。フルは拡張のみ）
  const site = {};
  let n = 0;
  for (const [k, v] of Object.entries(phrases)) {
    if (n >= 4000) break;
    site[k] = v;
    n += 1;
  }
  await writeFile(outSiteJson, JSON.stringify(site), "utf8");

  const meta = {
    source: "UniDic for Contemporary Written Japanese 3.1.1",
    url: "https://clrd.ninjal.ac.jp/unidic/",
    lexUrl: LEX_URL,
    license: "BSD-3-Clause (chosen from GPL/LGPL/BSD triple license)",
    filter: "名詞・漢字のみ・長さ2-8・固有名詞除外",
    count: Object.keys(phrases).length,
    siteCount: Object.keys(site).length,
    bytesUncompressed: bytes,
    bytesGzip: statSync(outGz).size,
    generatedAt: new Date().toISOString()
  };
  await writeFile(outMeta, JSON.stringify(meta, null, 2), "utf8");
  console.log(
    `Wrote ${meta.count} UniDic phrases (${(meta.bytesGzip / 1024).toFixed(0)} KB gz); site ${meta.siteCount}`
  );
  for (const s of ["学習", "漢字", "情報", "経済", "形態素"]) {
    console.log(`  ${s}: ${phrases[s] || "(none)"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
