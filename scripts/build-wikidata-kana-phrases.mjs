/**
 * Wikidata P1814（name in kana）から表層→読みフレーズを作る。
 * CC0。人名・作品名・一部地名などのギャップ埋め（低優先で Trie に載せる）。
 *
 * 出力: data/generated/wikidata-kana-phrases.json(.gz) + site サブセット
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  appendFileSync
} from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "wikidata");
const cacheJsonl = path.join(cacheDir, "p1814-ja.jsonl");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "wikidata-kana-phrases.json");
const outGz = path.join(outDir, "wikidata-kana-phrases.json.gz");
const outSite = path.join(outDir, "wikidata-kana-phrases-site.json");
const outMeta = path.join(outDir, "wikidata-kana-phrases.meta.json");
const extraPath = path.join(root, "data", "wikidata-kana-extra.json");

// 公式 WDQS が落ちることがあるので QLever を使う（同じ CC0 データ）
const SPARQL = "https://qlever.dev/api/wikidata";
const UA = "yt-furigana-extension-dict-builder/1.0 (https://github.com/Blackphi6/yt-furigana-extension)";
const PAGE = 10_000;
const SITE_MAX = 10_000;

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

function cleanReading(raw) {
  const h = toHiragana(raw);
  if (!h || !HIRA_OK.test(h)) return "";
  return h;
}

/**
 * @param {string} afterQ  前回の最後の Qid（空なら先頭から）
 */
function buildQuery(afterQ) {
  const filterAfter = afterQ
    ? `FILTER(STR(?s) > "http://www.wikidata.org/entity/${afterQ}")`
    : "";
  return `
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?s ?label ?kana WHERE {
  ?s wdt:P1814 ?kana .
  ?s rdfs:label ?label .
  FILTER(LANG(?label) = "ja")
  FILTER(STRSTARTS(STR(?s), "http://www.wikidata.org/entity/Q"))
  ${filterAfter}
}
ORDER BY ?s
LIMIT ${PAGE}
`.trim();
}

/**
 * @param {string} query
 * @param {number} [attempt]
 */
async function runSparql(query, attempt = 0) {
  const url = `${SPARQL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": UA
    }
  });
  if (!res.ok) {
    const t = await res.text();
    if (attempt < 6 && (res.status === 429 || res.status >= 500)) {
      const wait = 1500 * (attempt + 1) ** 2;
      console.warn(`SPARQL ${res.status}, retry in ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
      return runSparql(query, attempt + 1);
    }
    throw new Error(`SPARQL ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPairs() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(cacheJsonl) && statSync(cacheJsonl).size > 1_000_000) {
    console.log(`Using cached ${cacheJsonl}`);
    return;
  }

  writeFileSync(cacheJsonl, "");
  let after = "";
  let total = 0;
  for (let page = 0; page < 200; page += 1) {
    const data = await runSparql(buildQuery(after));
    const bindings = data?.results?.bindings || [];
    if (!bindings.length) break;
    const lines = [];
    for (const b of bindings) {
      const sid = String(b.s?.value || "").split("/").pop() || "";
      const label = b.label?.value || "";
      const kana = b.kana?.value || "";
      if (!sid || !label || !kana) continue;
      lines.push(JSON.stringify({ sid, label, kana }));
      after = sid;
    }
    appendFileSync(cacheJsonl, `${lines.join("\n")}\n`);
    total += lines.length;
    console.log(`Wikidata page ${page + 1}: +${lines.length} (total ${total}, last ${after})`);
    if (bindings.length < PAGE) break;
    // QLever は速いが連続でも礼儀として少し空ける
    await new Promise((r) => setTimeout(r, 150));
  }
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
  await fetchAllPairs();

  /** @type {Record<string, string>} */
  const phrases = {};
  /** @type {Record<string, string>} */
  const sitePhrases = {};
  let raw = 0;

  const text = readFileSync(cacheJsonl, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    raw += 1;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const surface = String(row.label || "").normalize("NFKC").trim();
    const reading = cleanReading(row.kana);
    if (!surface || surface.length < 2 || surface.length > 24) continue;
    if (!KANJI.test(surface)) continue;
    if (!reading) continue;
    // 同表層は先勝ち（Qid 昇順で安定）
    if (!phrases[surface]) phrases[surface] = reading;
    if (
      Object.keys(sitePhrases).length < SITE_MAX &&
      surface.length <= 12 &&
      !sitePhrases[surface]
    ) {
      sitePhrases[surface] = reading;
    }
  }

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
    source: "Wikidata property P1814 (name in kana) + Japanese rdfs:label",
    license: "CC0-1.0",
    upstreamUrl: "https://www.wikidata.org/wiki/Property:P1814",
    queryEndpoint: SPARQL,
    contentNotice:
      "Entity labels→kana from Wikidata (CC0). Community-curated; may contain errors.",
    rawPairs: raw,
    count: Object.keys(phrases).length,
    siteCount: Object.keys(sitePhrases).length,
    bytesUncompressed: bytes,
    bytesGzip: statSync(outGz).size,
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(
      ["葛飾北斎", "尾田栄一郎", "富士山", "任天堂"].map((s) => [
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
