/**
 * 常用漢字表付表（熟字訓・当て字）→ フレーズ辞書。
 * 出典: mimneko/kanji-data（文化庁 常用漢字表付表の機械可読化、CC0-1.0）
 *
 * Usage: node scripts/build-joyo-jukuji-phrases.mjs
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
const cacheDir = path.join(root, ".cache", "joyo-jukuji");
const srcUrl =
  "https://raw.githubusercontent.com/mimneko/kanji-data/main/%E5%B8%B8%E7%94%A8%E6%BC%A2%E5%AD%97%E8%A1%A8%E4%BB%98%E8%A1%A8.json";
const cacheFile = path.join(cacheDir, "joyo-fuhyo.json");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "joyo-jukuji-phrases.json");
const outGz = path.join(outDir, "joyo-jukuji-phrases.json.gz");
const outSite = path.join(outDir, "joyo-jukuji-phrases-site.json");
const outMeta = path.join(outDir, "joyo-jukuji-phrases.meta.json");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

async function ensure() {
  if (existsSync(cacheFile) && readFileSync(cacheFile).byteLength > 100) {
    return cacheFile;
  }
  mkdirSync(cacheDir, { recursive: true });
  console.log("Downloading 常用漢字表付表…");
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(cacheFile, Buffer.from(await res.arrayBuffer()));
  return cacheFile;
}

async function main() {
  await ensure();
  const rows = JSON.parse(readFileSync(cacheFile, "utf8"));
  /** @type {Record<string, string>} */
  const phrases = {};
  for (const row of rows || []) {
    const readings = Array.isArray(row["読み"]) ? row["読み"] : [];
    const surfaces = Array.isArray(row["語"]) ? row["語"] : [];
    const reading = toHiragana(readings[0] || "");
    if (!HIRA_OK.test(reading)) continue;
    for (const surface of surfaces) {
      const s = String(surface || "").normalize("NFKC").trim();
      // 「お巡りさん」等は漢字を含む複合を許可（長さ2+、漢字あり）
      if (!s || s.length < 2 || s.length > 12) continue;
      if (!KANJI.test(s)) continue;
      if (!phrases[s]) phrases[s] = reading;
    }
  }

  mkdirSync(outDir, { recursive: true });
  const json = `${JSON.stringify(phrases)}\n`;
  await writeFile(outJson, json);
  await writeFile(outSite, json);
  await pipeline(
    Readable.from([json]),
    createGzip({ level: 9 }),
    createWriteStream(outGz)
  );

  const meta = {
    source: "mimneko/kanji-data 常用漢字表付表.json（文化庁 常用漢字表付表）",
    license: "CC0-1.0",
    upstreamUrl: "https://github.com/mimneko/kanji-data",
    officialSource:
      "https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/",
    count: Object.keys(phrases).length,
    bytesUncompressed: Buffer.byteLength(json),
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["明日", "小豆", "大人", "今日", "一人", "田舎"].map((s) => [
        s,
        phrases[s] || null
      ])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${outGz} (${meta.count} phrases)`);
  console.log(meta.samples);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
