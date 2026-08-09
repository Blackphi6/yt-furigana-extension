/**
 * 商用利用可能な地名データから、拡張向け表層→読みフレーズを作る。
 *
 * 取り込み:
 * - Geolonia japanese-addresses … CC BY 4.0
 * - デジタル庁 ABR（町字 / 市区町村 / 都道府県）… PDL1.0 / CC BY 表記
 * - 国土地理院 地名集日本（LinkData 機械可読）… 地理院 PDL1.0（出典必須）
 * - GeoNLP（読み付きのみ）: 都道府県 / 日本歴史地名大系 地名・POI … CC BY 4.0
 * - 日本郵便 KEN_ALL（utf_ken_all）… 郵便番号データ利用許諾（商用可）
 *   ※ ABR/Geolonia に無い表層のみギャップ埋め（既存読みは上書きしない）
 *
 * 同梱しない: 電子国土基本図（地名情報）測量成果（複製・使用承認が絡みうる）
 *            GeoNLP の読み無し KSJ（空港・道の駅・駅など）
 *            駅データ.jp 無料 CSV（station_name_k が空。読みは station-phrases へ）
 *
 * Usage: node scripts/build-place-name-phrases.mjs
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "place-names");
const kenCacheDir = path.join(root, "data", ".cache", "ken-all");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "place-name-phrases.json");
const outGz = path.join(outDir, "place-name-phrases.json.gz");
const outMeta = path.join(outDir, "place-name-phrases.meta.json");
const outSiteJson = path.join(outDir, "place-name-phrases-site.json");
const outSiteGz = path.join(outDir, "place-name-phrases-site.json.gz");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fーゝゞ]+$/;
const DIGIT = /[0-9０-９]/;
/** KEN_ALL 町域のノイズ（ビル名・階・「以下に掲載がない場合」等） */
const KEN_TOWN_SKIP =
  /以下に掲載がない場合|の次に番地でくる場合|[0-9０-９]+階|ビル|マンション|アパート|団地|コーポ|ハイツ|メゾン|ヴィラ|パーク/;

const DIGIT_YOMI = {
  "0": "ぜろ",
  "1": "いち",
  "2": "に",
  "3": "さん",
  "4": "よん",
  "5": "ご",
  "6": "ろく",
  "7": "なな",
  "8": "はち",
  "9": "きゅう",
  "０": "ぜろ",
  "１": "いち",
  "２": "に",
  "３": "さん",
  "４": "よん",
  "５": "ご",
  "６": "ろく",
  "７": "なな",
  "８": "はち",
  "９": "きゅう"
};

const DIGIT_KANJI = {
  "0": "〇",
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
  "０": "〇",
  "１": "一",
  "２": "二",
  "３": "三",
  "４": "四",
  "５": "五",
  "６": "六",
  "７": "七",
  "８": "八",
  "９": "九"
};

const SOURCES = {
  abrPref: {
    url: "https://data.address-br.digital.go.jp/mt_pref/mt_pref_all.csv.zip",
    file: "mt_pref_all.csv.zip"
  },
  abrCity: {
    url: "https://data.address-br.digital.go.jp/mt_city/mt_city_all.csv.zip",
    file: "mt_city_all.csv.zip"
  },
  abrTown: {
    url: "https://data.address-br.digital.go.jp/mt_town/mt_town_all.csv.zip",
    file: "mt_town_all.csv.zip"
  },
  geolonia: {
    url: "https://geolonia.github.io/japanese-addresses/latest.csv",
    file: "geolonia-latest.csv"
  },
  gazetteer: {
    url: "http://linkdata.org/download/rdf1s8819i/link/gazetteer.txt",
    file: "gazetteer.txt"
  },
  geonlpPref: {
    url: "https://geonlp.ex.nii.ac.jp/dictionary/geoshape-pref/geoshape-pref-geolod.csv",
    file: "geoshape-pref-geolod.csv"
  },
  geonlpNrct: {
    url: "https://geonlp.ex.nii.ac.jp/dictionary/geoshape-nrct/geoshape-nrct-geolod.csv",
    file: "geoshape-nrct-geolod.csv"
  },
  geonlpNrctPoi: {
    url: "https://geonlp.ex.nii.ac.jp/dictionary/geoshape-nrct-poi/geoshape-nrct-poi-geolod.csv",
    file: "geoshape-nrct-poi-geolod.csv"
  }
};

/** 日本郵便 utf_ken_all（公式が落ちている場合は Wayback） */
const KEN_ALL_SOURCES = [
  "https://www.post.japanpost.jp/zipcode/dl/utf/zip/utf_ken_all.zip",
  "https://web.archive.org/web/20251113000000id_/https://www.post.japanpost.jp/zipcode/dl/utf/zip/utf_ken_all.zip"
];

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function digitsToYomi(text) {
  return String(text || "").replace(/[0-9０-９]/g, (d) => DIGIT_YOMI[d] || d);
}

function digitsToKanji(text) {
  return String(text || "").replace(/[0-9０-９]/g, (d) => DIGIT_KANJI[d] || d);
}

function cleanReading(raw) {
  let reading = toHiragana(String(raw || "").trim());
  reading = reading.replace(/[\s　・･/／|()（）「」『』[\]【】]/g, "");
  reading = digitsToYomi(reading);
  if (!HIRA_OK.test(reading) || reading.length < 1) return "";
  return reading;
}

function cleanSurface(raw) {
  return String(raw || "")
    .trim()
    .replace(/[\s　]+/g, "")
    .replace(/[()（）].*$/, "")
    .replace(/\/+$/, "");
}

/**
 * @param {Record<string, string>} phrases
 * @param {string} surface
 * @param {string} readingRaw
 * @param {Record<string, string> | null} [also]
 */
function addPhrase(phrases, surface, readingRaw, also = null) {
  const surfaceClean = cleanSurface(surface);
  const reading = cleanReading(readingRaw);
  if (!surfaceClean || surfaceClean.length < 2 || surfaceClean.length > 40) return false;
  if (!KANJI.test(surfaceClean)) return false;
  if (/^[0-9０-９一二三四五六七八九十百千]+$/.test(surfaceClean)) return false;
  if (!reading) return false;
  phrases[surfaceClean] = reading;
  if (also) also[surfaceClean] = reading;
  if (DIGIT.test(surfaceClean)) {
    const kanjiSurface = digitsToKanji(surfaceClean);
    if (kanjiSurface !== surfaceClean && KANJI.test(kanjiSurface)) {
      phrases[kanjiSurface] = reading;
      if (also) also[kanjiSurface] = reading;
    }
  }
  return true;
}

async function ensureFile(key) {
  mkdirSync(cacheDir, { recursive: true });
  const spec = SOURCES[key];
  const dest = path.join(cacheDir, spec.file);
  if (existsSync(dest) && statSync(dest).size > 100) return dest;
  console.log(`Downloading ${key}…`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`${key} download failed: ${res.status} ${spec.url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function unzipCached(zipPath, csvName) {
  const outCsv = path.join(cacheDir, csvName);
  if (existsSync(outCsv) && statSync(outCsv).size > 100) return outCsv;
  execFileSync("unzip", ["-o", "-q", zipPath, csvName, "-d", cacheDir]);
  return outCsv;
}

/** 簡易 CSV 1 行（引用符対応。ABR は無引用、Geolonia は引用あり） */
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function forEachCsvRow(filePath, onRow) {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let headers = null;
  for await (const line of rl) {
    if (!line || line.startsWith("#")) continue;
    const cols = splitCsvLine(line);
    if (!headers) {
      headers = cols.map((h) => h.trim());
      continue;
    }
    /** @type {Record<string, string>} */
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = (cols[i] ?? "").trim();
    }
    onRow(row);
  }
}

/**
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestGeolonia(phrases, sitePhrases, counts) {
  const csvPath = await ensureFile("geolonia");
  let added = 0;
  await forEachCsvRow(csvPath, (row) => {
    const pref = row["都道府県名"];
    const city = row["市区町村名"];
    const town = row["大字町丁目名"];
    // Pages 向けは都道府県・市区町村だけ（町丁目全文は重すぎる）
    if (addPhrase(phrases, pref, row["都道府県名カナ"], sitePhrases)) added += 1;
    if (addPhrase(phrases, city, row["市区町村名カナ"], sitePhrases)) added += 1;
    if (addPhrase(phrases, town, row["大字町丁目名カナ"])) added += 1;
    if (city && town) {
      if (
        addPhrase(
          phrases,
          `${city}${town}`,
          `${row["市区町村名カナ"] || ""}${row["大字町丁目名カナ"] || ""}`
        )
      ) {
        added += 1;
      }
    }
  });
  counts.geolonia = added;
  console.log(`Geolonia touched ≈ ${added}`);
}

/**
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestAbr(phrases, sitePhrases, counts) {
  const prefCsv = unzipCached(await ensureFile("abrPref"), "mt_pref_all.csv");
  const cityCsv = unzipCached(await ensureFile("abrCity"), "mt_city_all.csv");
  const townCsv = unzipCached(await ensureFile("abrTown"), "mt_town_all.csv");

  let added = 0;
  await forEachCsvRow(prefCsv, (row) => {
    if (addPhrase(phrases, row.pref, row.pref_kana, sitePhrases)) added += 1;
  });
  await forEachCsvRow(cityCsv, (row) => {
    if (row.city && addPhrase(phrases, row.city, row.city_kana, sitePhrases)) added += 1;
    if (row.ward && addPhrase(phrases, row.ward, row.ward_kana, sitePhrases)) added += 1;
    if (row.city && row.ward) {
      if (
        addPhrase(
          phrases,
          `${row.city}${row.ward}`,
          `${row.city_kana || ""}${row.ward_kana || ""}`,
          sitePhrases
        )
      ) {
        added += 1;
      }
    }
    if (row.county && addPhrase(phrases, row.county, row.county_kana, sitePhrases)) {
      added += 1;
    }
  });
  await forEachCsvRow(townCsv, (row) => {
    const oaza = row.oaza_cho;
    const oazaKana = row.oaza_cho_kana;
    const chome = row.chome;
    const chomeKana = row.chome_kana;
    const koaza = row.koaza;
    const koazaKana = row.koaza_kana;
    if (oaza && addPhrase(phrases, oaza, oazaKana)) added += 1;
    if (oaza && chome) {
      if (addPhrase(phrases, `${oaza}${chome}`, `${oazaKana || ""}${chomeKana || ""}`)) {
        added += 1;
      }
    }
    if (koaza && koazaKana && addPhrase(phrases, koaza, koazaKana)) added += 1;
    const city = row.ward ? `${row.city || ""}${row.ward}` : row.city || "";
    const cityKana = row.ward
      ? `${row.city_kana || ""}${row.ward_kana || ""}`
      : row.city_kana || "";
    if (city && oaza) {
      if (addPhrase(phrases, `${city}${oaza}`, `${cityKana}${oazaKana || ""}`)) {
        added += 1;
      }
    }
  });
  counts.abr = added;
  console.log(`ABR touched ≈ ${added}`);
}

/**
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestGazetteer(phrases, sitePhrases, counts) {
  const filePath = await ensureFile("gazetteer");
  const text = await readFile(filePath, "utf8");
  let added = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 4 || !/^\d+$/.test(cols[0])) continue;
    if (addPhrase(phrases, cols[2], cols[3], sitePhrases)) added += 1;
  }
  counts.gazetteer = added;
  console.log(`Gazetteer added ${added}`);
}

/**
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestGeonlp(phrases, sitePhrases, counts) {
  let before = Object.keys(phrases).length;
  await forEachCsvRow(await ensureFile("geonlpPref"), (row) => {
    const figure = row.figure || `${row.body || ""}${(row.suffix || "").replace(/\//g, "")}`;
    const kana = `${row.body_kana || ""}${(row.suffix_kana || "").replace(/\//g, "")}`;
    addPhrase(phrases, figure, kana, sitePhrases);
  });
  counts.geonlpPref = Object.keys(phrases).length - before;

  before = Object.keys(phrases).length;
  await forEachCsvRow(await ensureFile("geonlpNrct"), (row) => {
    addPhrase(phrases, row.body, row.body_kana);
  });
  counts.geonlpNrct = Object.keys(phrases).length - before;

  before = Object.keys(phrases).length;
  await forEachCsvRow(await ensureFile("geonlpNrctPoi"), (row) => {
    // 史跡名はデモでも有用なのでサイトにも載せる（件数は町丁目より少ない）
    addPhrase(phrases, row.body, row.body_kana, sitePhrases);
  });
  counts.geonlpNrctPoi = Object.keys(phrases).length - before;

  console.log("GeoNLP net:", counts);
}

/**
 * 既存 phrases に無い表層だけ追加（ギャップ埋め）。サイトには載せない。
 * @param {Record<string, string>} phrases
 * @param {string} surface
 * @param {string} readingRaw
 */
function addPhraseIfMissing(phrases, surface, readingRaw) {
  const surfaceClean = cleanSurface(surface);
  if (!surfaceClean || phrases[surfaceClean]) return false;
  return addPhrase(phrases, surfaceClean, readingRaw);
}

async function ensureKenAllCsv() {
  mkdirSync(kenCacheDir, { recursive: true });
  const csvPath = path.join(kenCacheDir, "utf_ken_all.csv");
  if (existsSync(csvPath) && statSync(csvPath).size > 1000) return csvPath;

  const zipPath = path.join(kenCacheDir, "utf_ken_all.zip");
  if (!(existsSync(zipPath) && statSync(zipPath).size > 1000)) {
    let lastErr = null;
    for (const url of KEN_ALL_SOURCES) {
      try {
        console.log(`Downloading KEN_ALL… ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
      }
    }
    if (lastErr) throw new Error(`KEN_ALL download failed: ${lastErr}`);
  }
  execFileSync("unzip", ["-o", "-q", zipPath, "utf_ken_all.csv", "-d", kenCacheDir]);
  if (!(existsSync(csvPath) && statSync(csvPath).size > 1000)) {
    throw new Error("KEN_ALL csv missing after unzip");
  }
  return csvPath;
}

/**
 * 日本郵便 KEN_ALL — ABR/Geolonia 等に無い町域だけ追加。
 * @param {Record<string, string>} phrases
 * @param {Record<string, number>} counts
 */
async function ingestKenAll(phrases, sitePhrases, counts) {
  void sitePhrases;
  const csvPath = await ensureKenAllCsv();
  const before = Object.keys(phrases).length;
  let rows = 0;
  let skippedNoise = 0;
  const rl = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of rl) {
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (cols.length < 9) continue;
    rows += 1;
    const city = cols[7];
    const town = cols[8];
    const cityKana = cols[4];
    const townKana = cols[5];
    if (!town || KEN_TOWN_SKIP.test(town)) {
      skippedNoise += 1;
      continue;
    }
    if (addPhraseIfMissing(phrases, town, townKana)) {
      /* town only */
    }
    if (city && town) {
      addPhraseIfMissing(phrases, `${city}${town}`, `${cityKana || ""}${townKana || ""}`);
    }
  }
  counts.kenAllAdded = Object.keys(phrases).length - before;
  counts.kenAllRows = rows;
  counts.kenAllSkippedNoise = skippedNoise;
  console.log(
    `KEN_ALL gap-fill +${counts.kenAllAdded} (rows=${rows}, noise≈${skippedNoise})`
  );
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
  /** @type {Record<string, string>} */
  const phrases = {};
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  /** @type {Record<string, number>} */
  const counts = {};

  console.log("Ingest Geolonia…");
  await ingestGeolonia(phrases, sitePhrases, counts);
  console.log("Ingest ABR (overwrite / expand)…");
  await ingestAbr(phrases, sitePhrases, counts);
  console.log("Ingest Gazetteer of Japan…");
  await ingestGazetteer(phrases, sitePhrases, counts);
  console.log("Ingest GeoNLP (kana-bearing)…");
  await ingestGeonlp(phrases, sitePhrases, counts);
  console.log("Ingest KEN_ALL (gap-fill only)…");
  await ingestKenAll(phrases, sitePhrases, counts);

  mkdirSync(outDir, { recursive: true });
  const bytesUncompressed = await writeJsonGz(outJson, outGz, phrases);
  const siteBytes = await writeJsonGz(outSiteJson, outSiteGz, sitePhrases);

  const meta = {
    sources: [
      {
        name: "Geolonia japanese-addresses",
        license: "CC BY 4.0",
        url: "https://github.com/geolonia/japanese-addresses"
      },
      {
        name: "デジタル庁 アドレス・ベース・レジストリ（町字等）",
        license: "PDL1.0 / CC BY 表記",
        url: "https://www.digital.go.jp/policies/base_registry_address"
      },
      {
        name: "国土地理院 地名集日本（LinkData 機械可読）",
        license: "国土地理院コンテンツ利用規約（PDL1.0）・出典必須",
        url: "https://www.gsi.go.jp/kihonjohochousa/gazetteer.html"
      },
      {
        name: "GeoNLP 地名語辞書（読み付き）",
        license: "CC BY 4.0",
        url: "https://geonlp.ex.nii.ac.jp/dictionary/"
      },
      {
        name: "日本郵便 郵便番号データ（KEN_ALL / utf_ken_all）",
        license: "日本郵便 郵便番号データ ダウンロードサービス利用許諾（商用可）",
        url: "https://www.post.japanpost.jp/zipcode/dl/utf-zip.html",
        note: "既存フレーズに無い町域のみギャップ埋め。ビル名・○階等は除外"
      }
    ],
    excluded: [
      "電子国土基本図（地名情報）— 測量成果のため拡張同梱しない",
      "GeoNLP KSJ 読み無し辞書（空港・道の駅・駅など）",
      "駅データ.jp 無料 CSV — station_name_k が空のため読み無し（駅は station-phrases）"
    ],
    siteSubset:
      "都道府県・市区町村・地名集・GeoNLP POI 等。町丁目全文は拡張のみ（Pages 軽量化）",
    counts,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed,
    bytesGzip: statSync(outGz).size,
    siteBytesUncompressed: siteBytes,
    siteBytesGzip: statSync(outSiteGz).size,
    generatedAt: new Date().toISOString(),
    contentNotice:
      "Japanese place-name surface→reading phrases for furigana. Attribution required (CC BY / PDL1.0). Not affiliated with data providers beyond license compliance.",
    samples: Object.fromEntries(
      [
        "北海道",
        "札幌市",
        "札幌市中央区",
        "旭ケ丘",
        "旭ケ丘一丁目",
        "富士山",
        "沖ノ鳥島",
        "利根川"
      ].map((s) => [s, phrases[s] || null])
    )
  };
  await writeFile(outMeta, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `Wrote ${meta.count} place-name phrases (${(meta.bytesGzip / 1024 / 1024).toFixed(2)} MB gz)`
  );
  console.log(
    `Site subset ${meta.siteCount} (${(meta.siteBytesGzip / 1024).toFixed(0)} KB gz)`
  );
  console.log("samples:", meta.samples);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
