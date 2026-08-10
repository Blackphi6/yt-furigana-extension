/**
 * 国税庁 法人番号公表サイト（全件 CSV・Unicode）から
 * 商号→フリガナを抽出して拡張向けフレーズ辞書を作る。
 *
 * ダウンロードは CSRF 付き POST（公式ページと同じ）。
 * 出力: data/generated/corporate-name-phrases.json(.gz) + site サブセット
 *
 * 出典: https://www.houjin-bangou.nta.go.jp/
 * 利用: 公共データ利用規約（商用可・出典必須）
 */
import {
  createReadStream,
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
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "nta");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "corporate-name-phrases.json");
const outGz = path.join(outDir, "corporate-name-phrases.json.gz");
const outSite = path.join(outDir, "corporate-name-phrases-site.json");
const outMeta = path.join(outDir, "corporate-name-phrases.meta.json");
const extraPath = path.join(root, "data", "corporate-name-extra.json");

const PAGE_URL = "https://www.houjin-bangou.nta.go.jp/download/zenken/";
const POST_URL = "https://www.houjin-bangou.nta.go.jp/download/zenken/index.html";

// 実測: ダウンロード CSV は 30 列。商号=6、フリガナ=28（0-index）
const COL_NAME = 6;
const COL_FURI = 28;

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fー]+$/;
const KATA_OK = /^[\u30a1-\u30f6ー]+$/;

const CORP_AFFIXES = [
  "株式会社",
  "有限会社",
  "合同会社",
  "合資会社",
  "合名会社",
  "一般社団法人",
  "一般財団法人",
  "公益社団法人",
  "公益財団法人",
  "特定非営利活動法人",
  "社会福祉法人",
  "学校法人",
  "医療法人",
  "宗教法人",
  "独立行政法人",
  "地方独立行政法人",
  "国立大学法人"
];

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    )
    .replace(/[\s　・･]/g, "");
}

function cleanReading(raw) {
  const h = toHiragana(raw);
  if (!h || !HIRA_OK.test(h)) return "";
  return h;
}

/**
 * 正式名から字幕向きの短い表層を取る（長い「株式会社…」は載せない＝メモリ対策）。
 * @param {string} name
 */
function deriveSurfaces(name) {
  const n = String(name || "").normalize("NFKC").trim();
  if (!n) return [];
  const out = new Set();
  let stem = n;
  for (const aff of CORP_AFFIXES) {
    if (stem.startsWith(aff)) stem = stem.slice(aff.length);
    if (stem.endsWith(aff)) stem = stem.slice(0, -aff.length);
  }
  stem = stem.trim();
  // 接尾辞を剥いだ短い社名（本命）
  if (stem.length >= 2 && stem.length <= 16 && KANJI.test(stem)) out.add(stem);
  // そもそも短い正式名（接尾辞なし）
  const hasAffix = CORP_AFFIXES.some((a) => n.startsWith(a) || n.endsWith(a));
  if (!hasAffix && n.length >= 2 && n.length <= 20 && KANJI.test(n)) out.add(n);
  return [...out];
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

/**
 * ページから Unicode・全国の fileNo を取る。
 * @param {string} html
 */
function findUnicodeNationalFileNo(html) {
  const uni = html.split('id="csv-unicode"')[1];
  if (!uni) throw new Error("csv-unicode section missing");
  const m = uni.match(/doDownload\((\d+)\)/);
  if (!m) throw new Error("unicode national doDownload id missing");
  return m[1];
}

async function ensureNationalCsv() {
  mkdirSync(cacheDir, { recursive: true });
  const existing = readdirSync(cacheDir).find(
    (f) => /^00_zenkoku_all_.*\.csv$/.test(f)
  );
  if (existing) {
    const p = path.join(cacheDir, existing);
    if (statSync(p).size > 100_000_000) {
      console.log(`Using cached ${p}`);
      return p;
    }
  }

  console.log("Fetching NTA download page…");
  const pageRes = await fetch(PAGE_URL, {
    headers: { "User-Agent": "yt-furigana-extension-dict-builder/1.0" }
  });
  if (!pageRes.ok) throw new Error(`NTA page failed: ${pageRes.status}`);
  const html = await pageRes.text();
  const token = html.match(
    /CNSFWTokenProcessor\.request\.token" value="([^"]+)"/
  )?.[1];
  if (!token) throw new Error("NTA CSRF token missing");
  const fileNo = findUnicodeNationalFileNo(html);
  console.log(`Downloading NTA unicode national (fileNo=${fileNo})…`);

  const body = new URLSearchParams({
    "jp.go.nta.houjin_bangou.framework.web.common.CNSFWTokenProcessor.request.token":
      token,
    event: "download",
    selDlFileNo: fileNo
  });
  const res = await fetch(POST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "yt-furigana-extension-dict-builder/1.0"
    },
    body
  });
  if (!res.ok) throw new Error(`NTA download failed: ${res.status}`);
  const disp = res.headers.get("content-disposition") || "";
  const nameMatch = disp.match(/filename\*=utf-8''([^;]+)|filename="?([^";]+)"?/i);
  const zipName = decodeURIComponent(
    nameMatch?.[1] || nameMatch?.[2] || "00_zenkoku_all.zip"
  );
  const zipPath = path.join(cacheDir, zipName);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(zipPath, buf);
  console.log(`Wrote ${zipPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

  execFileSync("unzip", ["-o", zipPath, "-d", cacheDir], { stdio: "inherit" });
  const csv = readdirSync(cacheDir).find((f) => /^00_zenkoku_all_.*\.csv$/.test(f));
  if (!csv) throw new Error("NTA CSV not found after unzip");
  return path.join(cacheDir, csv);
}

/**
 * @param {string} csvPath
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 */
async function ingestCsv(csvPath, phrases, sitePhrases) {
  let rows = 0;
  let withFuri = 0;
  let added = 0;
  let siteCount = 0;
  const SITE_CAP = 12_000;
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line) continue;
    rows += 1;
    const cols = parseCsvLine(line);
    if (cols.length <= COL_FURI) continue;
    const name = String(cols[COL_NAME] || "").normalize("NFKC").trim();
    const furi = String(cols[COL_FURI] || "").trim();
    if (!name || !furi) continue;
    if (!KANJI.test(name)) continue;
    // フリガナ列はカタカナ想定（稀に空でないゴミを弾く）
    if (!KATA_OK.test(furi.replace(/[\s　・･]/g, ""))) continue;
    const reading = cleanReading(furi);
    if (!reading) continue;
    withFuri += 1;

    for (const surface of deriveSurfaces(name)) {
      if (!phrases[surface]) {
        phrases[surface] = reading;
        added += 1;
      }
      // site: さらに短いものだけ（Object.keys は毎回やらない）
      if (
        surface.length <= 12 &&
        siteCount < SITE_CAP &&
        !sitePhrases[surface]
      ) {
        sitePhrases[surface] = reading;
        siteCount += 1;
      }
    }
  }
  return { rows, withFuri, added };
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
  const csvPath = await ensureNationalCsv();
  /** @type {Record<string, string>} */
  const phrases = {};
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  const stats = await ingestCsv(csvPath, phrases, sitePhrases);

  if (existsSync(extraPath)) {
    const extra = JSON.parse(readFileSync(extraPath, "utf8"));
    for (const [surface, reading] of Object.entries(extra || {})) {
      const r = cleanReading(reading);
      if (!surface || !r) continue;
      phrases[surface] = r;
      sitePhrases[surface] = r;
    }
  }

  const bytes = await writeJsonGz(outJson, outGz, phrases);
  await writeFile(outSite, `${JSON.stringify(sitePhrases)}\n`);

  const meta = {
    source: "国税庁 法人番号公表サイト 全件データ（CSV・Unicode）",
    license: "公共データ利用規約（第1.0版）/ 政府標準利用規約互換・商用可・出典必須",
    upstreamUrl: "https://www.houjin-bangou.nta.go.jp/download/zenken/",
    contentNotice:
      "Corporate names (kanji→hiragana from official furigana). Attribution required. Not affiliated with NTA.",
    columns: { name: COL_NAME, furigana: COL_FURI },
    rows: stats.rows,
    rowsWithFurigana: stats.withFuri,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed: bytes,
    bytesGzip: statSync(outGz).size,
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["任天堂", "トヨタ自動車", "ソフトバンク", "キーエンス"].map((s) => [
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
