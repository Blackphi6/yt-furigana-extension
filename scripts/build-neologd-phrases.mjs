/**
 * mecab-ipadic-NEologd のシードから、拡張向け固有名詞フレーズ辞書を作る。
 *
 * 全文種ではなく字幕向けに絞った固有名詞表層→読みのみ。
 * 出力: data/generated/neologd-phrases.json.gz（build で dict/ へコピー）
 *
 * ライセンス: Apache-2.0（NEologd）。帰属は COPYING / NOTICE を参照。
 */
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
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
const outGz = path.join(root, "data", "generated", "neologd-phrases.json.gz");
const outMeta = path.join(root, "data", "generated", "neologd-phrases.meta.json");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const READING_OK = /^[\u30a1-\u30f6\u3041-\u309fーｰ]+$/;
const ASCII = /[A-Za-z0-9]/;

/** コストが高くて自動枠から落ちやすい高需要語 */
const FORCE_SURFACES = [
  "呪術廻戦",
  "東京スカイツリー",
  "本田圭佑",
  "創価学会",
  "任天堂",
  "スタジオジブリ",
  "新海誠",
  "宮崎駿"
];

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function shouldKeep(surface, cost, pos2) {
  if (FORCE_SURFACES.includes(surface)) return true;
  if (surface.includes("の")) return true;
  if (pos2 === "一般" && surface.length >= 4 && surface.length <= 14 && cost <= 4000) {
    return true;
  }
  if (pos2 === "人名" && surface.length >= 3 && surface.length <= 5 && cost <= 3500) {
    return true;
  }
  return false;
}

async function ensureSeed() {
  if (existsSync(seedCache)) return seedCache;
  mkdirSync(path.dirname(seedCache), { recursive: true });
  console.log("Downloading NEologd seed…");
  const res = await fetch(seedUrl);
  if (!res.ok) throw new Error(`seed download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(seedCache, buf);
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

function parseSeed(csvText) {
  const best = new Map();
  for (const line of csvText.split("\n")) {
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 13) continue;
    const surface = parts[0];
    const pos1 = parts[5];
    const pos2 = parts[6];
    const reading = parts[11];
    if (pos1 !== "固有名詞") continue;
    if (!KANJI.test(surface)) continue;
    if (surface.length < 2 || surface.length > 20) continue;
    if (!READING_OK.test(reading || "")) continue;
    const asciiCount = (surface.match(ASCII) || []).length;
    if (asciiCount > surface.length / 2) continue;
    const cost = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(cost)) continue;
    const prev = best.get(surface);
    if (!prev || cost < prev.cost) {
      best.set(surface, { cost, reading, pos2 });
    }
  }
  return best;
}

async function main() {
  const seedPath = await ensureSeed();
  console.log("Decompressing seed…");
  const csv = decompressXz(seedPath);
  console.log("Parsing…");
  const best = parseSeed(csv);

  const phrases = {};
  for (const [surface, meta] of best) {
    if (!shouldKeep(surface, meta.cost, meta.pos2)) continue;
    phrases[surface] = toHiragana(meta.reading);
  }
  for (const surface of FORCE_SURFACES) {
    const meta = best.get(surface);
    if (meta) phrases[surface] = toHiragana(meta.reading);
  }

  mkdirSync(path.dirname(outGz), { recursive: true });
  mkdirSync(path.dirname(outMeta), { recursive: true });

  const json = JSON.stringify(phrases);
  await pipeline(Readable.from([json]), createGzip({ level: 9 }), createWriteStream(outGz));

  const meta = {
    source: "mecab-ipadic-NEologd seed mecab-user-dict-seed.20200910.csv.xz",
    license: "Apache-2.0",
    count: Object.keys(phrases).length,
    bytesUncompressed: Buffer.byteLength(json),
    generatedAt: new Date().toISOString(),
    filters: {
      include: [
        "固有名詞 with の",
        "一般 4–14 cost<=4000",
        "人名 3–5 cost<=3500",
        "FORCE_SURFACES"
      ]
    },
    samples: Object.fromEntries(
      ["鬼滅の刃", "呪術廻戦", "東京スカイツリー", "本田圭佑", "進撃の巨人"].map((s) => [
        s,
        phrases[s] || null
      ])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${outGz} (${meta.count} phrases)`);
  console.log(meta.samples);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
