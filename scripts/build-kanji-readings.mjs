#!/usr/bin/env node
/**
 * Unicode Unihan から単漢字の日本語読みを抽出する。
 *
 * 優先: kJapanese（かな。MJ文字情報基盤由来を Unicode が再配布）
 * フォールバック: kJapaneseKun / kJapaneseOn（ローマ字 → 簡易かな）
 *
 * ライセンス: Unicode License Agreement（商用可・帰属表示）
 * https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip
 *
 * MJ文字情報一覧表そのもの（CC BY-SA 2.1 JP）は同梱しない。
 * kJapanese が同系統の読みを Unicode 条件で再配布しているため。
 *
 * Usage: node scripts/build-kanji-readings.mjs
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, "data", ".cache", "unihan");
const zipPath = path.join(cacheDir, "Unihan.zip");
const readingsPath = path.join(cacheDir, "Unihan_Readings.txt");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "kanji-readings.json");
const outGz = path.join(outDir, "kanji-readings.json.gz");
const outMeta = path.join(outDir, "kanji-readings.meta.json");

const UNIHAN_URL = "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip";

/** Hepburn 風ローマ字 → ひらがな（Unihan On/Kun 用の最低限） */
const ROMAJI = [
  ["kkya", "っきゃ"],
  ["kkyu", "っきゅ"],
  ["kkyo", "っきょ"],
  ["ssha", "っしゃ"],
  ["sshu", "っしゅ"],
  ["ssho", "っしょ"],
  ["ccha", "っちゃ"],
  ["cchu", "っちゅ"],
  ["ccho", "っちょ"],
  ["ttya", "っちゃ"],
  ["ttyu", "っちゅ"],
  ["ttyo", "っちょ"],
  ["hhya", "っひゃ"],
  ["hhyu", "っひゅ"],
  ["hhyo", "っひょ"],
  ["ppya", "っぴゃ"],
  ["ppyu", "っぴゅ"],
  ["ppyo", "っぴょ"],
  ["kya", "きゃ"],
  ["kyu", "きゅ"],
  ["kyo", "きょ"],
  ["sha", "しゃ"],
  ["shu", "しゅ"],
  ["sho", "しょ"],
  ["cha", "ちゃ"],
  ["chu", "ちゅ"],
  ["cho", "ちょ"],
  ["nya", "にゃ"],
  ["nyu", "にゅ"],
  ["nyo", "にょ"],
  ["hya", "ひゃ"],
  ["hyu", "ひゅ"],
  ["hyo", "ひょ"],
  ["mya", "みゃ"],
  ["myu", "みゅ"],
  ["myo", "みょ"],
  ["rya", "りゃ"],
  ["ryu", "りゅ"],
  ["ryo", "りょ"],
  ["gya", "ぎゃ"],
  ["gyu", "ぎゅ"],
  ["gyo", "ぎょ"],
  ["ja", "じゃ"],
  ["ju", "じゅ"],
  ["jo", "じょ"],
  ["bya", "びゃ"],
  ["byu", "びゅ"],
  ["byo", "びょ"],
  ["pya", "ぴゃ"],
  ["pyu", "ぴゅ"],
  ["pyo", "ぴょ"],
  ["tsu", "つ"],
  ["chi", "ち"],
  ["shi", "し"],
  ["fu", "ふ"],
  ["ka", "か"],
  ["ki", "き"],
  ["ku", "く"],
  ["ke", "け"],
  ["ko", "こ"],
  ["sa", "さ"],
  ["su", "す"],
  ["se", "せ"],
  ["so", "そ"],
  ["ta", "た"],
  ["te", "て"],
  ["to", "と"],
  ["na", "な"],
  ["ni", "に"],
  ["nu", "ぬ"],
  ["ne", "ね"],
  ["no", "の"],
  ["ha", "は"],
  ["hi", "ひ"],
  ["he", "へ"],
  ["ho", "ほ"],
  ["ma", "ま"],
  ["mi", "み"],
  ["mu", "む"],
  ["me", "め"],
  ["mo", "も"],
  ["ya", "や"],
  ["yu", "ゆ"],
  ["yo", "よ"],
  ["ra", "ら"],
  ["ri", "り"],
  ["ru", "る"],
  ["re", "れ"],
  ["ro", "ろ"],
  ["wa", "わ"],
  ["wo", "を"],
  ["n", "ん"],
  ["ga", "が"],
  ["gi", "ぎ"],
  ["gu", "ぐ"],
  ["ge", "げ"],
  ["go", "ご"],
  ["za", "ざ"],
  ["ji", "じ"],
  ["zu", "ず"],
  ["ze", "ぜ"],
  ["zo", "ぞ"],
  ["da", "だ"],
  ["de", "で"],
  ["do", "ど"],
  ["ba", "ば"],
  ["bi", "び"],
  ["bu", "ぶ"],
  ["be", "べ"],
  ["bo", "ぼ"],
  ["pa", "ぱ"],
  ["pi", "ぴ"],
  ["pu", "ぷ"],
  ["pe", "ぺ"],
  ["po", "ぽ"],
  ["a", "あ"],
  ["i", "い"],
  ["u", "う"],
  ["e", "え"],
  ["o", "お"]
].sort((a, b) => b[0].length - a[0].length);

function romajiToHiragana(raw) {
  let s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z']/g, "");
  if (!s) return "";
  let out = "";
  while (s) {
    // 促音: 子音重複（っか 等は上表でカバーしきれない分）
    if (s.length >= 2 && s[0] === s[1] && !"aeioun".includes(s[0])) {
      out += "っ";
      s = s.slice(1);
      continue;
    }
    let hit = null;
    for (const [roma, hira] of ROMAJI) {
      if (s.startsWith(roma)) {
        hit = [roma, hira];
        break;
      }
    }
    if (!hit) return "";
    out += hit[1];
    s = s.slice(hit[0].length);
  }
  return out;
}

function toHiragana(text) {
  return String(text || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function cleanReading(raw) {
  const h = toHiragana(String(raw || "").normalize("NFKC").trim());
  if (!h || !/^[\u3041-\u309fー]+$/.test(h)) return "";
  return h;
}

/**
 * 単漢字の既定読み: 音 → 短い訓 → 名詞っぽい訓 → その他訓。
 * 切れ端フォールバックは「落選の落→らく」のように音が役立つことが多い。
 * 「鬱→しげる」より「うつ」を優先するためにも音を先にする。
 */
function pickDefaultReading(kun, on) {
  if (on.length) return on[0];
  const shortKun = kun.filter((k) => k.length <= 2);
  if (shortKun.length) return shortKun[0];
  const nounish = kun.filter((k) => k.length <= 3 && !/[るすむう]$/.test(k));
  if (nounish.length) return nounish[0];
  return kun[0] || "";
}

async function ensureUnihanReadings() {
  mkdirSync(cacheDir, { recursive: true });
  if (existsSync(readingsPath) && statSync(readingsPath).size > 1_000_000) {
    console.log(`Using cached ${readingsPath}`);
    return;
  }
  if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) {
    console.log(`Downloading Unihan.zip…`);
    const res = await fetch(UNIHAN_URL);
    if (!res.ok) throw new Error(`Unihan download failed: ${res.status}`);
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  const { execFileSync } = await import("node:child_process");
  execFileSync("unzip", ["-o", zipPath, "Unihan_Readings.txt", "-d", cacheDir], {
    stdio: "inherit"
  });
}

/**
 * @returns {Promise<Record<string, { default: string, readings: string[] }>>}
 */
async function parseUnihan() {
  /** @type {Map<string, { kana: string[], kun: string[], on: string[] }>} */
  const byCp = new Map();

  const rl = createInterface({
    input: createReadStream(readingsPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line || line.startsWith("#")) continue;
    const [cp, field, value] = line.split("\t");
    if (!cp?.startsWith("U+") || !field || !value) continue;
    if (
      field !== "kJapanese" &&
      field !== "kJapaneseKun" &&
      field !== "kJapaneseOn"
    ) {
      continue;
    }
    let entry = byCp.get(cp);
    if (!entry) {
      entry = { kana: [], kun: [], on: [] };
      byCp.set(cp, entry);
    }
    if (field === "kJapanese") {
      for (const part of value.trim().split(/\s+/)) {
        const raw = String(part || "").normalize("NFKC").trim();
        const isKatakana = /[\u30a1-\u30f6]/.test(raw);
        const r = cleanReading(raw);
        if (!r) continue;
        if (isKatakana) {
          if (!entry.on.includes(r)) entry.on.push(r);
        } else if (!entry.kun.includes(r)) {
          entry.kun.push(r);
        }
        if (!entry.kana.includes(r)) entry.kana.push(r);
      }
    } else if (field === "kJapaneseKun") {
      for (const part of value.trim().split(/\s+/)) {
        const r = cleanReading(romajiToHiragana(part));
        if (r && !entry.kun.includes(r)) entry.kun.push(r);
      }
    } else if (field === "kJapaneseOn") {
      for (const part of value.trim().split(/\s+/)) {
        const r = cleanReading(romajiToHiragana(part));
        if (r && !entry.on.includes(r)) entry.on.push(r);
      }
    }
  }

  /** @type {Record<string, { default: string, readings: string[] }>} */
  const out = {};
  let fromKana = 0;
  let fromRomaji = 0;

  for (const [cp, entry] of byCp) {
    const code = Number.parseInt(cp.slice(2), 16);
    if (!Number.isFinite(code)) continue;
    const ch = String.fromCodePoint(code);
    // 漢字ブロック以外は捨てる
    if (!/[\u3400-\u9fff\uF900-\uFAFF]/.test(ch)) continue;

    let readings = [];
    let def = "";
    if (entry.kana.length || entry.kun.length || entry.on.length) {
      const kun = entry.kun.length ? entry.kun : [];
      const on = entry.on.length ? entry.on : [];
      readings = [...kun, ...on.filter((r) => !kun.includes(r))];
      if (!readings.length) readings = entry.kana;
      def = pickDefaultReading(kun, on) || readings[0] || "";
      if (entry.kana.length) fromKana += 1;
      else fromRomaji += 1;
    }
    if (!readings.length || !def) continue;

    out[ch] = { default: def, readings };
  }

  console.log(
    `Unihan chars ${Object.keys(out).length} (kJapanese ${fromKana}, romaji-fallback ${fromRomaji})`
  );
  return out;
}

async function writeJsonGz(jsonPath, gzPath, data) {
  mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(data);
  await writeFile(jsonPath, text, "utf8");
  await pipeline(
    Readable.from([text]),
    createGzip({ level: 9 }),
    createWriteStream(gzPath)
  );
  return Buffer.byteLength(text);
}

async function main() {
  await ensureUnihanReadings();
  const data = await parseUnihan();
  const bytes = await writeJsonGz(outJson, outGz, data);
  const meta = {
    source: "Unicode Unihan Database",
    url: UNIHAN_URL,
    license: "Unicode License Agreement",
    fields: ["kJapanese", "kJapaneseKun", "kJapaneseOn"],
    note: "MJ文字情報一覧表（CC BY-SA）は同梱せず、Unihan kJapanese を使用",
    count: Object.keys(data).length,
    bytesUncompressed: bytes,
    bytesGzip: statSync(outGz).size,
    generatedAt: new Date().toISOString()
  };
  await writeFile(outMeta, JSON.stringify(meta, null, 2), "utf8");
  console.log(
    `Wrote ${meta.count} kanji readings (${(meta.bytesGzip / 1024).toFixed(0)} KB gz)`
  );
  for (const ch of ["東", "安", "龍", "鬱", "辻"]) {
    console.log(`  ${ch}:`, data[ch]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
