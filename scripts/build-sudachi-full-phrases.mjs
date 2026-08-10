/**
 * SudachiDict Full 専用語彙（notcore_lex）から固有名詞フレーズを抽出。
 * Full の system.dic を拡張に同梱すると数百 MB になるため、読み付き表層だけ載せる。
 *
 * 出力: data/generated/sudachi-full-phrases.json(.gz) + site サブセット
 * ライセンス: Apache-2.0（SudachiDict）
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync
} from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "sudachi");
const zipUrl =
  "http://sudachi.s3-website-ap-northeast-1.amazonaws.com/sudachidict-raw/20260428/notcore_lex.zip";
const zipPath = path.join(cacheDir, "notcore_lex.zip");
const csvPath = path.join(cacheDir, "notcore_lex.csv");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "sudachi-full-phrases.json");
const outGz = path.join(outDir, "sudachi-full-phrases.json.gz");
const outSite = path.join(outDir, "sudachi-full-phrases-site.json");
const outMeta = path.join(outDir, "sudachi-full-phrases.meta.json");

const SITE_MAX = 8_000;
const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

function cleanReading(raw) {
  const h = toHiragana(raw).replace(/[ﾞﾟ]/g, "");
  if (!h || !HIRA_OK.test(h)) return "";
  return h;
}

function parseCsvLine(line) {
  /** @type {string[]} */
  const cols = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      cols.push(cur);
      cur = "";
    } else cur += ch;
  }
  cols.push(cur);
  return cols;
}

async function ensureCsv() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(csvPath) && statSync(csvPath).size > 100_000_000) {
    console.log(`Using cached ${csvPath}`);
    return csvPath;
  }
  if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
    console.log(`Downloading ${zipUrl}…`);
    const res = await fetch(zipUrl);
    if (!res.ok) throw new Error(`notcore_lex download failed: ${res.status}`);
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  execFileSync("unzip", ["-o", zipPath, "-d", cacheDir], { stdio: "inherit" });
  if (!existsSync(csvPath)) throw new Error("notcore_lex.csv missing after unzip");
  return csvPath;
}

async function writeJsonGz(filePath, gzPath, data) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const text = `${JSON.stringify(data)}\n`;
  await writeFile(filePath, text);
  await pipeline(
    Readable.from([text]),
    createGzip({ level: 9 }),
    createWriteStream(gzPath)
  );
  return Buffer.byteLength(text);
}

async function main() {
  const csv = await ensureCsv();
  /** @type {Record<string, string>} */
  const phrases = {};
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  let scanned = 0;
  let kept = 0;

  const rl = createInterface({
    input: createReadStream(csv, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    scanned += 1;
    if (!line.includes("固有名詞")) continue;
    const cols = parseCsvLine(line);
    // surface, left, right, cost, ..., pos..., reading@11
    if (cols.length < 12) continue;
    if (cols[5] !== "名詞" || cols[6] !== "固有名詞") continue;
    const surface = String(cols[0] || "").normalize("NFKC").trim();
    if (!surface || surface.length < 2 || surface.length > 24) continue;
    if (!KANJI.test(surface)) continue;
    // 絵文字・記号だらけを除外
    if (/^[!！#＃$＄@＠]/.test(surface)) continue;
    const reading = cleanReading(cols[11]);
    if (!reading) continue;
    if (!phrases[surface]) {
      phrases[surface] = reading;
      kept += 1;
    }
    if (
      Object.keys(sitePhrases).length < SITE_MAX &&
      surface.length <= 10 &&
      !sitePhrases[surface]
    ) {
      sitePhrases[surface] = reading;
    }
  }

  const bytes = await writeJsonGz(outJson, outGz, phrases);
  await writeFile(outSite, `${JSON.stringify(sitePhrases)}\n`);

  const meta = {
    source: "SudachiDict notcore_lex.csv (Full-only lexicon)",
    license: "Apache-2.0",
    upstreamUrl: "https://github.com/WorksApplications/SudachiDict",
    rawUrl: zipUrl,
    contentNotice:
      "Proper-noun surface→reading extracted from Sudachi Full lexicon. Tokenizer remains packaged system.dic (size-limited).",
    scanned,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed: bytes,
    bytesGzip: statSync(outGz).size,
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["任天堂", "東京", "神子畑", "ソフトバンク"].map((s) => [
        s,
        phrases[s] || null
      ])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `Wrote ${outGz} (${meta.count} phrases, site ${meta.siteCount})`
  );
  console.log(meta.samples);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
