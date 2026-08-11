/**
 * ja-furigana-dict の熟語 TOML（works 除外）からフレーズ辞書を作る。
 * MIT。読みの [アクセント] 記法は剥がしてひらがな化する。
 *
 * Usage: node scripts/build-ja-furigana-phrases.mjs
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "ja-furigana-dict");
const repoZipUrl =
  "https://codeload.github.com/RyuuNeko1107/ja-furigana-dict/zip/refs/heads/master";
const zipPath = path.join(cacheDir, "ja-furigana-dict-master.zip");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "ja-furigana-phrases.json");
const outGz = path.join(outDir, "ja-furigana-phrases.json.gz");
const outSite = path.join(outDir, "ja-furigana-phrases-site.json");
const outMeta = path.join(outDir, "ja-furigana-phrases.meta.json");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

/** `[ベ]イチュウ` / `[ケッピン` / `とうげ]みち` → かなのみ */
function cleanReading(raw) {
  let s = String(raw || "");
  s = s.replace(/[\[\]]/g, "");
  s = toHiragana(s);
  s = s.replace(/[^ぁ-んー]/g, "");
  return HIRA_OK.test(s) ? s : "";
}

async function ensureRepo() {
  mkdirSync(cacheDir, { recursive: true });
  const extracted = readdirSync(cacheDir).find((n) =>
    n.startsWith("ja-furigana-dict-")
  );
  if (extracted) {
    const p = path.join(cacheDir, extracted);
    if (existsSync(path.join(p, "core", "jukugo"))) return p;
  }
  console.log("Downloading ja-furigana-dict…");
  const res = await fetch(repoZipUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", cacheDir]);
  const again = readdirSync(cacheDir).find((n) =>
    n.startsWith("ja-furigana-dict-")
  );
  if (!again) throw new Error("extract failed");
  return path.join(cacheDir, again);
}

function* walkToml(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "works") continue;
      yield* walkToml(full);
    } else if (name.endsWith(".toml") && !name.includes("test") && name !== "_genre.toml") {
      yield full;
    }
  }
}

/**
 * 単純な `"表層" = "読み"` 行だけ拾う（detailed block はスキップ）。
 * @param {string} text
 */
function parseEntries(text) {
  /** @type {Record<string, string>} */
  const out = {};
  let inEntries = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("[")) {
      inEntries = t === "[entries]";
      continue;
    }
    if (!inEntries || !t || t.startsWith("#")) continue;
    // detailed form: "上手" = { ... } はスキップ
    if (t.includes("={") || t.includes("= {")) continue;
    const m = t.match(/^"([^"]+)"\s*=\s*"([^"]*)"/);
    if (!m) continue;
    const surface = m[1].normalize("NFKC").trim();
    const reading = cleanReading(m[2]);
    if (!surface || surface.length < 2 || surface.length > 16) continue;
    if (!KANJI.test(surface)) continue;
    if (!reading) continue;
    out[surface] = reading;
  }
  return out;
}

async function main() {
  const repoRoot = await ensureRepo();
  const jukugoRoot = path.join(repoRoot, "core", "jukugo");
  /** @type {Record<string, string>} */
  const phrases = {};
  let files = 0;
  for (const file of walkToml(jukugoRoot)) {
    // 人名/姓は工藤側に任せる（衝突ノイズ回避）
    if (
      file.includes(`${path.sep}proper${path.sep}personal_names.toml`) ||
      file.includes(`${path.sep}proper${path.sep}surnames.toml`)
    ) {
      continue;
    }
    files += 1;
    Object.assign(phrases, parseEntries(readFileSync(file, "utf8")));
  }

  /** @type {Record<string, string>} */
  const sitePhrases = {};
  let siteCount = 0;
  for (const [surface, reading] of Object.entries(phrases)) {
    if (surface.length > 8) continue;
    if (siteCount >= 10_000) break;
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
    source: "RyuuNeko1107/ja-furigana-dict core/jukugo（works・姓/名 TOML 除外）",
    license: "MIT",
    upstreamUrl: "https://github.com/RyuuNeko1107/ja-furigana-dict",
    filesScanned: files,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed: Buffer.byteLength(json),
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["等身大", "仮名", "田舎", "大人", "絵文字", "痛車"].map((s) => [
        s,
        phrases[s] || null
      ])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`Wrote ${outGz} (${meta.count} phrases, site ${meta.siteCount})`);
  console.log(meta.samples);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
