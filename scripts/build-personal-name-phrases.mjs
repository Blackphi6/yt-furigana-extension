/**
 * 人名フレーズ（表層→ひらがな）を組み立てる。
 *
 * 優先（後勝ち）:
 * 1. 工藤 personal_name.zip（Mozc 抽出・姓/名）— 本丸
 * 2. japanese-personal-name-dataset 姓（MIT・頻度上位）— 常用姓の読みを上書き
 * 3. 沖縄辞書 name.dic（Public Domain）— ギャップ埋め
 * 4. data/personal-name-extra.json — 手置き上書き
 *
 * 名は長さ 2〜4 のみ（1 字名は単漢字層に任せる）。
 *
 * Usage: node scripts/build-personal-name-phrases.mjs
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "personal-names");
const kudouZipUrl = "http://chasen.org/~taku/software/misc/personal_name.zip";
const kudouZip = path.join(cacheDir, "personal_name.zip");
const mitCsvUrl =
  "https://raw.githubusercontent.com/shuheilocale/japanese-personal-name-dataset/main/japanese_personal_name_dataset/dataset/last_name_org.csv";
const mitCsv = path.join(cacheDir, "last_name_org.csv");
const odicNameUrl =
  "https://raw.githubusercontent.com/makotoga/o-dic/main/name.dic";
const odicName = path.join(cacheDir, "o-dic-name.dic");
const extraPath = path.join(root, "data", "personal-name-extra.json");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "personal-name-phrases.json");
const outGz = path.join(outDir, "personal-name-phrases.json.gz");
const outMeta = path.join(outDir, "personal-name-phrases.meta.json");
const outSite = path.join(outDir, "personal-name-phrases-site.json");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    )
    .replace(/[\s　・･]/g, "");
}

async function ensureDownload(url, dest) {
  if (existsSync(dest) && readFileSync(dest).byteLength > 100) return dest;
  mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Downloading ${path.basename(dest)}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

/**
 * @param {string} filePath
 * @param {"姓"|"名"} wantPos
 * @param {{ minLen: number, maxLen: number }} len
 * @returns {Map<string, { reading: string, cost: number }>}
 */
function parseKudou(filePath, wantPos, len) {
  /** @type {Map<string, { reading: string, cost: number }>} */
  const best = new Map();
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split("\n")) {
    if (!line.trim() || line.startsWith("よみ") || line.startsWith("Mozc")) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const yomi = toHiragana(parts[0]);
    const surface = parts[1].normalize("NFKC").trim();
    const pos = parts[2].trim();
    const cost = Number.parseInt(parts[3], 10);
    if (pos !== wantPos) continue;
    if (!surface || !KANJI.test(surface)) continue;
    if (surface.length < len.minLen || surface.length > len.maxLen) continue;
    if (!HIRA_OK.test(yomi)) continue;
    if (!Number.isFinite(cost)) continue;
    const prev = best.get(surface);
    if (!prev || cost < prev.cost) best.set(surface, { reading: yomi, cost });
  }
  return best;
}

/** @returns {Map<string, { reading: string, count: number }>} */
function parseMitSurnames(csvText) {
  /** @type {Map<string, { reading: string, count: number }>} */
  const best = new Map();
  for (const line of csvText.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const surface = parts[0].trim();
    const count = Number.parseInt(parts[1], 10) || 0;
    const reading = toHiragana(parts[2].trim());
    if (!surface || surface.length < 2 || surface.length > 8) continue;
    if (!KANJI.test(surface) || !HIRA_OK.test(reading)) continue;
    const prev = best.get(surface);
    if (!prev || count > prev.count) best.set(surface, { reading, count });
  }
  return best;
}

/** o-dic: yomi\\tkanji\\t種別 */
function parseOdicName(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 2) continue;
    const reading = toHiragana(parts[0]);
    const surface = parts[1].normalize("NFKC");
    if (!surface || surface.length < 2 || surface.length > 8) continue;
    if (!KANJI.test(surface) || !HIRA_OK.test(reading)) continue;
    if (!out[surface]) out[surface] = reading;
  }
  return out;
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  await ensureDownload(kudouZipUrl, kudouZip);
  await ensureDownload(mitCsvUrl, mitCsv);
  await ensureDownload(odicNameUrl, odicName);

  execFileSync("unzip", ["-o", "-q", kudouZip, "-d", cacheDir]);
  const seiPath = path.join(cacheDir, "sei.txt");
  const meiPath = path.join(cacheDir, "mei.txt");
  if (!existsSync(seiPath) || !existsSync(meiPath)) {
    throw new Error("kudou zip missing sei.txt/mei.txt");
  }

  const sei = parseKudou(seiPath, "姓", { minLen: 2, maxLen: 8 });
  const mei = parseKudou(meiPath, "名", { minLen: 2, maxLen: 4 });
  const mit = parseMitSurnames(readFileSync(mitCsv, "utf8"));
  const odic = parseOdicName(readFileSync(odicName, "utf8"));

  /** @type {Record<string, string>} */
  const phrases = {};
  for (const [surface, info] of sei) phrases[surface] = info.reading;
  for (const [surface, info] of mei) {
    if (!phrases[surface]) phrases[surface] = info.reading;
  }
  // MIT 常用姓は頻度付きなので上書き
  for (const [surface, info] of mit) phrases[surface] = info.reading;
  // 沖縄姓はギャップのみ
  let odicAdded = 0;
  for (const [surface, reading] of Object.entries(odic)) {
    if (!phrases[surface]) {
      phrases[surface] = reading;
      odicAdded += 1;
    }
  }

  /** @type {Record<string, string>} */
  let extra = {};
  if (existsSync(extraPath)) {
    extra = JSON.parse(readFileSync(extraPath, "utf8"));
    for (const [surface, reading] of Object.entries(extra || {})) {
      const normalized = toHiragana(String(reading || "").trim());
      if (!surface || !HIRA_OK.test(normalized)) continue;
      phrases[surface] = normalized;
    }
  }

  // site: 短い表層を優先
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  let siteCount = 0;
  for (const [surface, reading] of Object.entries(phrases)) {
    if (surface.length > 4) continue;
    if (siteCount >= 8_000) break;
    sitePhrases[surface] = reading;
    siteCount += 1;
  }

  mkdirSync(outDir, { recursive: true });
  const json = `${JSON.stringify(phrases)}\n`;
  await writeFile(outJson, json);
  await writeFile(outSite, `${JSON.stringify(sitePhrases)}\n`);
  await pipeline(
    Readable.from([json]),
    createGzip({ level: 9 }),
    createWriteStream(outGz)
  );

  const meta = {
    sources: [
      {
        name: "工藤拓 personal_name.zip（Mozc 人名抽出）",
        license: "Mozc OSS 辞書由来（IPAdic/NAIST 条件付き・再配布可）",
        url: kudouZipUrl,
        note: "NEologd COPYING でも利用。姓は全件、名は長さ2–4"
      },
      {
        name: "shuheilocale/japanese-personal-name-dataset last_name_org.csv",
        license: "MIT",
        url: "https://github.com/shuheilocale/japanese-personal-name-dataset",
        note: "頻度上位姓で読みを上書き"
      },
      {
        name: "沖縄辞書 name.dic",
        license: "Public Domain",
        url: "https://github.com/makotoga/o-dic",
        note: "既存に無い姓のみギャップ埋め"
      },
      {
        name: "data/personal-name-extra.json",
        license: "プロジェクト内手置き"
      }
    ],
    count: Object.keys(phrases).length,
    kudouSei: sei.size,
    kudouMei: mei.size,
    mitSurnames: mit.size,
    odicGapFilled: odicAdded,
    extraCount: Object.keys(extra || {}).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed: Buffer.byteLength(json),
    generatedAt: new Date().toISOString(),
    contentNotice:
      "Japanese personal-name surface→reading for furigana. Attribution required. Not affiliated with data providers beyond license compliance.",
    samples: Object.fromEntries(
      ["佐藤", "鈴木", "高橋", "経沢", "田中", "東里", "太郎", "花子"].map((s) => [
        s,
        phrases[s] || null
      ])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  // 非圧縮フルは大きいので gitignore 対象。site は残す
  if (existsSync(outJson)) {
    // keep for local build; gitignore handles tracking
  }
  console.log(`Wrote ${outGz} (${meta.count} phrases, site ${meta.siteCount})`);
  console.log(meta.samples);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
