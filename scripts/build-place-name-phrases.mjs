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
 * - mecab-ipadic-NEologd 種子の 固有名詞/地域 … Apache-2.0（ギャップ埋め）
 * - 複合表層からの裸表層派生（村/跡/選鉱所 等を剥がす）
 * - data/place-name-extra.json（手置き。商用可ソースに無い観光表記など）
 *
 * 同梱しない: 電子国土基本図（地名情報）測量成果（複製・使用承認が絡みうる）
 *            GeoNLP の読み無し KSJ / 歴史地名298k（カナ無し）
 *            国交省位置参照情報（カナ無し）
 *            OSM name:ja-Hira（ODbL 共有義務が重い）
 *            JMnedict（CC BY-SA）
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
import { execFileSync, spawnSync } from "node:child_process";

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
const extraPath = path.join(root, "data", "place-name-extra.json");
const neologdSeedUrl =
  "https://github.com/neologd/mecab-ipadic-neologd/raw/master/seed/mecab-user-dict-seed.20200910.csv.xz";
const neologdSeedCache = path.join(root, ".cache", "mecab-user-dict-seed.20200910.csv.xz");

const KANJI = /[\u3400-\u9fff\uF900-\uFAFF]/;
const HIRA_OK = /^[\u3041-\u309fーゝゞ]+$/;
const READING_KATA_OK = /^[\u30a1-\u30f6\u3041-\u309fーｰ]+$/;
const DIGIT = /[0-9０-９]/;
/** KEN_ALL 町域のノイズ（ビル名・階・「以下に掲載がない場合」等） */
const KEN_TOWN_SKIP =
  /以下に掲載がない場合|の次に番地でくる場合|[0-9０-９]+階|ビル|マンション|アパート|団地|コーポ|ハイツ|メゾン|ヴィラ|パーク/;

/**
 * 長い接尾辞から順に。読み末尾が一致すれば裸表層を派生する。
 * @type {Array<[string, string[]]>}
 */
const BARE_SUFFIXES = [
  ["鉱山跡", ["こうざんあと"]],
  ["選鉱場跡", ["せんこうじょうあと"]],
  ["選鉱所", ["せんこうしょ"]],
  ["選鉱場", ["せんこうじょう"]],
  ["交流館", ["こうりゅうかん"]],
  ["鋳鉄橋", ["ちゅうてっきょう"]],
  ["村", ["むら"]],
  ["町", ["まち", "ちょう"]],
  ["市", ["し"]],
  ["郡", ["ぐん"]],
  ["区", ["く"]],
  ["川", ["がわ", "かわ"]],
  ["峠", ["とうげ"]],
  ["橋", ["ばし", "はし"]],
  ["跡", ["あと"]],
  ["山", ["やま", "さん"]],
  ["駅", ["えき"]]
];

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

async function ensureNeologdSeed() {
  if (existsSync(neologdSeedCache) && statSync(neologdSeedCache).size > 1000) {
    return neologdSeedCache;
  }
  mkdirSync(path.dirname(neologdSeedCache), { recursive: true });
  console.log("Downloading NEologd seed…");
  const res = await fetch(neologdSeedUrl);
  if (!res.ok) throw new Error(`NEologd seed download failed: ${res.status}`);
  await writeFile(neologdSeedCache, Buffer.from(await res.arrayBuffer()));
  return neologdSeedCache;
}

function decompressNeologdSeed(filePath) {
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
 * NEologd 種子の 固有名詞/地域 — 既存に無い表層だけ追加（駅は station-phrases 側）。
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestNeologdChiiki(phrases, sitePhrases, counts) {
  const seedPath = await ensureNeologdSeed();
  console.log("Decompressing NEologd seed for 地域…");
  const csv = decompressNeologdSeed(seedPath);
  /** @type {Map<string, { cost: number, reading: string }>} */
  const best = new Map();
  for (const line of csv.split("\n")) {
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 13) continue;
    if (parts[5] !== "固有名詞" || parts[6] !== "地域") continue;
    const surface = parts[0];
    if (surface.endsWith("駅")) continue;
    if (!KANJI.test(surface)) continue;
    if (surface.length < 2 || surface.length > 24) continue;
    const reading = parts[11];
    if (!READING_KATA_OK.test(reading || "")) continue;
    const cost = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(cost)) continue;
    const prev = best.get(surface);
    if (!prev || cost < prev.cost) best.set(surface, { cost, reading });
  }

  const before = Object.keys(phrases).length;
  for (const [surface, meta] of best) {
    const reading = toHiragana(meta.reading);
    // 拡張のみ（Pages は町丁目級を載せない方針のまま）
    addPhraseIfMissing(phrases, surface, reading);
  }
  counts.neologdChiikiAdded = Object.keys(phrases).length - before;
  counts.neologdChiikiCandidates = best.size;
  console.log(
    `NEologd 地域 gap-fill +${counts.neologdChiikiAdded} (candidates=${best.size})`
  );
}

/**
 * 複合表層から接尾辞を剥がした裸表層をギャップ埋め。
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
function deriveBareSurfaces(phrases, sitePhrases, counts) {
  const before = Object.keys(phrases).length;
  /** @type {Array<[string, string]>} */
  const snapshot = Object.entries(phrases);
  for (const [surface, reading] of snapshot) {
    for (const [suffix, yomiEnds] of BARE_SUFFIXES) {
      if (!surface.endsWith(suffix) || surface.length <= suffix.length + 1) continue;
      const yomiEnd = yomiEnds.find((y) => reading.endsWith(y));
      if (!yomiEnd) continue;
      const bare = surface.slice(0, -suffix.length);
      const bareReading = reading.slice(0, -yomiEnd.length);
      if (bare.length < 2 || bareReading.length < 2) continue;
      if (!KANJI.test(bare) || !HIRA_OK.test(bareReading)) continue;
      if (addPhraseIfMissing(phrases, bare, bareReading)) {
        if (sitePhrases[surface]) addPhraseIfMissing(sitePhrases, bare, bareReading);
      }
      break;
    }
  }
  counts.bareDerived = Object.keys(phrases).length - before;
  console.log(`Bare-surface derive +${counts.bareDerived}`);
}

/**
 * 手置き extra（観光表記などソースに無い表層）。
 * @param {Record<string, string>} phrases
 * @param {Record<string, string>} sitePhrases
 * @param {Record<string, number>} counts
 */
async function ingestExtra(phrases, sitePhrases, counts) {
  if (!existsSync(extraPath)) {
    counts.extra = 0;
    return;
  }
  const extra = JSON.parse(await readFile(extraPath, "utf8"));
  let added = 0;
  for (const [surface, reading] of Object.entries(extra || {})) {
    // extra は意図的に上書き可（神子畑など既存の誤読・欠落を直す）
    if (addPhrase(phrases, surface, reading, sitePhrases)) added += 1;
  }
  counts.extra = added;
  console.log(`place-name-extra +${added}`);
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
  console.log("Ingest NEologd 地域 (gap-fill)…");
  await ingestNeologdChiiki(phrases, sitePhrases, counts);
  console.log("Derive bare surfaces from compounds…");
  deriveBareSurfaces(phrases, sitePhrases, counts);
  console.log("Ingest place-name-extra…");
  await ingestExtra(phrases, sitePhrases, counts);

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
        url: "https://geonlp.ex.nii.ac.jp/dictionary/",
        note: "都道府県 / 歴史地名大系 地名・POI。カナ無し辞書は除外"
      },
      {
        name: "日本郵便 郵便番号データ（KEN_ALL / utf_ken_all）",
        license: "日本郵便 郵便番号データ ダウンロードサービス利用許諾（商用可）",
        url: "https://www.post.japanpost.jp/zipcode/dl/utf-zip.html",
        note: "既存フレーズに無い町域のみギャップ埋め。ビル名・○階等は除外"
      },
      {
        name: "mecab-ipadic-NEologd seed（固有名詞/地域）",
        license: "Apache-2.0",
        url: "https://github.com/neologd/mecab-ipadic-neologd",
        note: "既存に無い地域表層のみ。*駅は station-phrases"
      },
      {
        name: "複合表層からの裸表層派生",
        license: "加工（上記ソース由来）",
        note: "村/町/跡/選鉱所 等を剥がして表層を増やす"
      },
      {
        name: "data/place-name-extra.json",
        license: "プロジェクト内手置き",
        note: "オープンデータに無い観光表記などの補完"
      }
    ],
    excluded: [
      "電子国土基本図（地名情報）— 測量成果のため拡張同梱しない",
      "GeoNLP KSJ 読み無し辞書（空港・道の駅・駅など）",
      "GeoNLP 歴史地名データ（nihu-placename）— カナ無しのため未使用",
      "GeoNLP 歴史的行政区域β / 江戸マップ — カナ無しのため未使用",
      "国交省位置参照情報 — カナ無しのため未使用",
      "OpenStreetMap name:ja-Hira — ODbL 共有義務が重いため未同梱",
      "JMnedict / ENAMDICT — CC BY-SA のため未同梱",
      "国土地理協会・行政区画便覧など有償マスター — 再配布不可",
      "駅データ.jp 無料 CSV — station_name_k が空（駅は station-phrases）"
    ],
    siteSubset:
      "都道府県・市区町村・地名集・GeoNLP POI・施設っぽい NEologd 地域・extra。町丁目全文は拡張のみ",
    counts,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed,
    bytesGzip: statSync(outGz).size,
    siteBytesUncompressed: siteBytes,
    siteBytesGzip: statSync(outSiteGz).size,
    generatedAt: new Date().toISOString(),
    contentNotice:
      "Japanese place-name surface→reading phrases for furigana. Attribution required (CC BY / PDL1.0 / Apache-2.0). Not affiliated with data providers beyond license compliance.",
    samples: Object.fromEntries(
      [
        "北海道",
        "札幌市",
        "富士山",
        "神子畑",
        "神子畑村",
        "神子畑選鉱場跡",
        "神子畑鉱山跡",
        "放出",
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
