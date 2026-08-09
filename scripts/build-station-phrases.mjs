/**
 * 鉄道駅の表層→読みフレーズを作る。
 *
 * ソース: mecab-ipadic-NEologd シードの「…駅」エントリ（Apache-2.0）
 * - 「放出駅」→「はなてんえき」
 * - 「放出」→「はなてん」（駅を除いた表層。地名 Trie より後で勝たせる）
 *
 * 駅データ.jp 無料 CSV は station_name_k が空のため使わない。
 *
 * Usage: node scripts/build-station-phrases.mjs
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const seedUrl =
  "https://github.com/neologd/mecab-ipadic-neologd/raw/master/seed/mecab-user-dict-seed.20200910.csv.xz";
const seedCache = path.join(root, ".cache", "mecab-user-dict-seed.20200910.csv.xz");
const outDir = path.join(root, "data", "generated");
const outGz = path.join(outDir, "station-phrases.json.gz");
const outJson = path.join(outDir, "station-phrases.json");
const outMeta = path.join(outDir, "station-phrases.meta.json");
const outSiteJson = path.join(outDir, "station-phrases-site.json");
const outSiteGz = path.join(outDir, "station-phrases-site.json.gz");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const READING_OK = /^[\u30a1-\u30f6\u3041-\u309fーｰ]+$/;

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

async function ensureSeed() {
  if (existsSync(seedCache) && statSync(seedCache).size > 1000) return seedCache;
  mkdirSync(path.dirname(seedCache), { recursive: true });
  console.log("Downloading NEologd seed…");
  const res = await fetch(seedUrl);
  if (!res.ok) throw new Error(`seed download failed: ${res.status}`);
  await writeFile(seedCache, Buffer.from(await res.arrayBuffer()));
  return seedCache;
}

function decompressXz(filePath) {
  const xz = spawnSync("xz", ["-dc", filePath], {
    maxBuffer: 1024 * 1024 * 512,
    encoding: "utf8"
  });
  if (xz.status === 0 && xz.stdout) return xz.stdout;

  const py = spawnSync(
    "python3",
    [
      "-c",
      "import lzma,sys; print(lzma.open(sys.argv[1], 'rt', encoding='utf-8', errors='replace').read(), end='')",
      filePath
    ],
    { maxBuffer: 1024 * 1024 * 512, encoding: "utf8" }
  );
  if (py.status !== 0) {
    throw new Error(`xz decompress failed: ${String(xz.stderr || py.stderr)}`);
  }
  return py.stdout;
}

/**
 * 「…駅」エントリを収集。同表層は cost が小さい方、同点なら 地域 を優先。
 * @param {string} csvText
 */
function collectStations(csvText) {
  /** @type {Map<string, { cost: number, reading: string, pos2: string }>} */
  const best = new Map();
  for (const line of csvText.split("\n")) {
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 13) continue;
    const surface = parts[0];
    if (!surface.endsWith("駅")) continue;
    if (parts[5] !== "固有名詞") continue;
    if (!KANJI.test(surface)) continue;
    if (surface.length < 2 || surface.length > 24) continue;
    const reading = parts[11];
    if (!READING_OK.test(reading || "")) continue;
    const cost = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(cost)) continue;
    const pos2 = parts[6] || "";
    const prev = best.get(surface);
    if (
      !prev ||
      cost < prev.cost ||
      (cost === prev.cost && pos2 === "地域" && prev.pos2 !== "地域")
    ) {
      best.set(surface, { cost, reading, pos2 });
    }
  }
  return best;
}

/**
 * 「はなてんえき」→「はなてん」。末尾が えき/駅 読みでなければ空。
 * @param {string} readingHira
 */
function stripEkiReading(readingHira) {
  if (readingHira.endsWith("えき")) return readingHira.slice(0, -2);
  return "";
}

async function writeJsonGz(fileJson, fileGz, obj) {
  const json = `${JSON.stringify(obj)}\n`;
  await writeFile(fileJson, json);
  await pipeline(
    Readable.from([json]),
    createGzip({ level: 9 }),
    createWriteStream(fileGz)
  );
  return Buffer.byteLength(json);
}

async function main() {
  const seedPath = await ensureSeed();
  console.log("Decompressing seed…");
  const csv = decompressXz(seedPath);
  console.log("Collecting *駅…");
  const best = collectStations(csv);

  /** @type {Record<string, string>} */
  const phrases = {};
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  let withEki = 0;
  let bare = 0;

  // cost が低い駅から適用（同表層の bare は先勝ち＝より駅らしい読み）
  const ranked = [...best.entries()].sort((a, b) => a[1].cost - b[1].cost);
  for (const [surface, meta] of ranked) {
    const reading = toHiragana(meta.reading);
    phrases[surface] = reading;
    sitePhrases[surface] = reading;
    withEki += 1;

    const bareSurface = surface.slice(0, -1);
    const bareReading = stripEkiReading(reading);
    // 1字駅名や読みが取れないものはスキップ（「駅」単独など）
    if (
      bareSurface.length >= 2 &&
      KANJI.test(bareSurface) &&
      bareReading.length >= 2 &&
      !phrases[bareSurface]
    ) {
      phrases[bareSurface] = bareReading;
      sitePhrases[bareSurface] = bareReading;
      bare += 1;
    }
  }

  mkdirSync(outDir, { recursive: true });
  const bytesUncompressed = await writeJsonGz(outJson, outGz, phrases);
  const siteBytes = await writeJsonGz(outSiteJson, outSiteGz, sitePhrases);

  const meta = {
    source: "mecab-ipadic-NEologd seed (*駅 entries)",
    license: "Apache-2.0",
    contentNotice:
      "Station surface→reading phrases derived from NEologd for furigana only. No affiliation with railway operators.",
    excluded: [
      "駅データ.jp 無料 CSV — station_name_k が空のため未使用"
    ],
    count: Object.keys(phrases).length,
    withEki,
    bareWithoutEki: bare,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed,
    bytesGzip: statSync(outGz).size,
    siteBytesUncompressed: siteBytes,
    siteBytesGzip: statSync(outSiteGz).size,
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["放出", "放出駅", "十三", "十三駅", "東京駅", "新宿駅", "難波", "難波駅"].map(
        (s) => [s, phrases[s] || null]
      )
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `Wrote ${meta.count} station phrases (${(meta.bytesGzip / 1024).toFixed(0)} KB gz; *駅=${withEki}, bare=${bare})`
  );
  console.log("samples:", meta.samples);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
