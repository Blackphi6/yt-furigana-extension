/**
 * japanese-personal-name-dataset（MIT）の姓 CSV から、拡張向け表層→読みを作る。
 *
 * 上流の last_name_org.csv は推定人数上位 ~1999 姓のみ。
 * レア姓は data/personal-name-extra.json で補完する。
 *
 * 出力: data/generated/personal-name-phrases.json(.gz)
 * 出典: https://github.com/shuheilocale/japanese-personal-name-dataset
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const csvUrl =
  "https://raw.githubusercontent.com/shuheilocale/japanese-personal-name-dataset/main/japanese_personal_name_dataset/dataset/last_name_org.csv";
const csvCache = path.join(root, ".cache", "last_name_org.csv");
const extraPath = path.join(root, "data", "personal-name-extra.json");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "personal-name-phrases.json");
const outGz = path.join(outDir, "personal-name-phrases.json.gz");
const outMeta = path.join(outDir, "personal-name-phrases.meta.json");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

async function ensureCsv() {
  if (existsSync(csvCache)) return csvCache;
  mkdirSync(path.dirname(csvCache), { recursive: true });
  console.log("Downloading last_name_org.csv…");
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`last_name download failed: ${res.status}`);
  await writeFile(csvCache, Buffer.from(await res.arrayBuffer()));
  return csvCache;
}

/**
 * @param {string} csvText
 * @returns {Map<string, { reading: string, count: number }>}
 */
function parseLastNames(csvText) {
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
    if (!KANJI.test(surface)) continue;
    if (!HIRA_OK.test(reading)) continue;
    const prev = best.get(surface);
    if (!prev || count > prev.count) {
      best.set(surface, { reading, count });
    }
  }
  return best;
}

async function main() {
  const csvPath = await ensureCsv();
  const csvText = readFileSync(csvPath, "utf8");
  const parsed = parseLastNames(csvText);

  /** @type {Record<string, string>} */
  const phrases = {};
  for (const [surface, info] of parsed) {
    phrases[surface] = info.reading;
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

  mkdirSync(outDir, { recursive: true });
  const json = `${JSON.stringify(phrases)}\n`;
  await writeFile(outJson, json);
  await pipeline(
    Readable.from([json]),
    createGzip({ level: 9 }),
    createWriteStream(outGz)
  );

  const meta = {
    source:
      "shuheilocale/japanese-personal-name-dataset last_name_org.csv (+ data/personal-name-extra.json)",
    license: "MIT",
    upstreamUrl:
      "https://github.com/shuheilocale/japanese-personal-name-dataset",
    contentNotice:
      "Japanese surnames (kanji→hiragana) for furigana only. MIT. No affiliation with dataset author beyond license compliance.",
    count: Object.keys(phrases).length,
    upstreamLastNameCount: parsed.size,
    extraCount: Object.keys(extra || {}).length,
    bytesUncompressed: Buffer.byteLength(json),
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["佐藤", "鈴木", "高橋", "経沢", "田中"].map((s) => [s, phrases[s] || null])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${outGz} (${meta.count} phrases)`);
  console.log(meta.samples);
  if (!phrases["経沢"]) {
    console.warn(
      "WARN: 経沢 is not in upstream last_name_org.csv; add to data/personal-name-extra.json"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
