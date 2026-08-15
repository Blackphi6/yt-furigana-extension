#!/usr/bin/env node
/**
 * 公開 G2P / ふりがな評価データセットで自エンジンを数値評価する。
 *
 * 対象:
 * - filmapp/ja-tts-g2p-bench（MIT）… 文脈依存漢字読み 151 問（TTS 論文と同項目）
 * - filmapp/ja-tts-g2p-bench blindspot v1 … 追加 151 問（LLM 生成・盲点）
 * - benchmark-release/YOMI-Bench（MIT）… 複数読み予測 377 問（語内漢字）
 * - sbintuitions/joyo-kanji-yomi-benchmark（MIT）… 常用漢字読み（元）
 * - Parakeet-Inc/joyo-kanji-yomi-benchmark-parakeet（MIT）… 常用漢字読み（修正＋付表）
 * - CyberAgentAILab/jvs_nonpara_kana（CC BY-SA 4.0・評価用のみ、同梱しない）
 * - リポジトリ内 seed / hard / easy ゲート
 *
 * Usage:
 *   node scripts/eval/run-public-g2p-benches.mjs
 *   node scripts/eval/run-public-g2p-benches.mjs --jvs-limit=500 --joyo-limit=2000
 *   node scripts/eval/run-public-g2p-benches.mjs --skip-internal --joyo-limit=13095
 *   node scripts/eval/run-public-g2p-benches.mjs --joyo-parakeet-limit=2000 --no-site
 *
 * 注意: JVS データは ShareAlike のため .cache に置き、結果の数値のみ報告する。
 * 詳細: docs/G2P-BENCHMARKS.md
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import kuromoji from "kuromoji";
import { buildFuriganaHtml } from "../../src/furigana.js";
import {
  evaluateRubyAgainstExpect,
  extractReadingsFromRubyHtml
} from "../../src/reading-learning.js";
import { normalizeReading } from "../../src/reading-normalize.js";
import {
  createBenchTokenizer,
  loadJsonl,
  runSeedBench,
  learnedOverridesPath
} from "../learning/bench-utils.mjs";
import { installNeologdPhrasesForTests } from "../../src/neologd-phrases.js";
import { installPlaceNamePhrasesForTests } from "../../src/place-name-phrases.js";
import { installStationPhrasesForTests } from "../../src/station-phrases.js";
import { installUnidicPhrasesForTests } from "../../src/unidic-phrases.js";
import { installJoyoJukujiPhrasesForTests } from "../../src/joyo-jukuji-phrases.js";
import { installJaFuriganaPhrasesForTests } from "../../src/ja-furigana-phrases.js";
import { installWikidataKanaPhrasesForTests } from "../../src/wikidata-kana-phrases.js";
import { installSudachiFullPhrasesForTests } from "../../src/sudachi-full-phrases.js";
import { installCorporateNamePhrasesForTests } from "../../src/corporate-name-phrases.js";
import {
  installPersonalNamePhrasesForTests,
  rebuildCombinedPhraseTrie
} from "../../src/personal-name-phrases.js";
import { installKanjiReadingsForTests } from "../../src/kanji-readings.js";
import { scoreJoyoParakeetItems } from "./joyo-parakeet-score.mjs";
import { parseYomiBenchRows } from "./yomi-bench-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const cacheDir = path.join(root, ".cache", "eval");
const outDir = path.join(root, "data", "eval");
const G2P_URL =
  "https://raw.githubusercontent.com/filmapp/ja-tts-g2p-bench/main/data/items_read_bench_v1.jsonl";
const G2P_BLINDSPOT_URL =
  "https://raw.githubusercontent.com/filmapp/ja-tts-g2p-bench/main/data/items_blindspot_v1.jsonl";
const YOMI_BENCH_URL =
  "https://raw.githubusercontent.com/benchmark-release/YOMI-Bench/main/tasks/kanji_reading_prediction/multiple/kanji_multiple_reading_hiragana_fewshot_0.jsonl";
const JVS_URL =
  "https://raw.githubusercontent.com/CyberAgentAILab/jvs_nonpara_kana/main/jvs_nonpara_kana.csv";

function parseLimit(flag, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!arg) return fallback;
  const n = Number(arg.slice(flag.length + 1));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const JVS_LIMIT = parseLimit("--jvs-limit", 500);
const JOYO_LIMIT = parseLimit("--joyo-limit", 2000);
const JOYO_PARAKEET_LIMIT = parseLimit("--joyo-parakeet-limit", 2000);
const JOYO_URL =
  "https://huggingface.co/datasets/sbintuitions/joyo-kanji-yomi-benchmark/resolve/main/common_kanji_source.jsonl";
const JOYO_PARAKEET_URL =
  "https://huggingface.co/datasets/Parakeet-Inc/joyo-kanji-yomi-benchmark-parakeet/resolve/main/data/common_kanji_source.jsonl";
const SKIP_INTERNAL = process.argv.includes("--skip-internal");
const NO_SITE = process.argv.includes("--no-site");

function toHiragana(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

/** 長音を直前母音に展開（JVS eval_cer.py と同趣旨） */
function expandChoon(text) {
  const vowels = new Set("あいうえおやゆよ");
  const map = {
    あ: "あ",
    い: "い",
    う: "う",
    え: "え",
    お: "お",
    か: "あ",
    き: "い",
    く: "う",
    け: "え",
    こ: "お",
    さ: "あ",
    し: "い",
    す: "う",
    せ: "え",
    そ: "お",
    た: "あ",
    ち: "い",
    つ: "う",
    て: "え",
    と: "お",
    な: "あ",
    に: "い",
    ぬ: "う",
    ね: "え",
    の: "お",
    は: "あ",
    ひ: "い",
    ふ: "う",
    へ: "え",
    ほ: "お",
    ま: "あ",
    み: "い",
    む: "う",
    め: "え",
    も: "お",
    や: "あ",
    ゆ: "う",
    よ: "お",
    ら: "あ",
    り: "い",
    る: "う",
    れ: "え",
    ろ: "お",
    わ: "あ",
    を: "お",
    ん: "ん",
    ぁ: "あ",
    ぃ: "い",
    ぅ: "う",
    ぇ: "え",
    ぉ: "お",
    ゃ: "あ",
    ゅ: "う",
    ょ: "お",
    っ: "っ",
    が: "あ",
    ぎ: "い",
    ぐ: "う",
    げ: "え",
    ご: "お",
    ざ: "あ",
    じ: "い",
    ず: "う",
    ぜ: "え",
    ぞ: "お",
    だ: "あ",
    ぢ: "い",
    づ: "う",
    で: "え",
    ど: "お",
    ば: "あ",
    び: "い",
    ぶ: "う",
    べ: "え",
    ぼ: "お",
    ぱ: "あ",
    ぴ: "い",
    ぷ: "う",
    ぺ: "え",
    ぽ: "お"
  };
  let out = "";
  for (const ch of text) {
    if (ch === "ー" && out.length) {
      const prev = out[out.length - 1];
      out += map[prev] || (vowels.has(prev) ? prev : "");
    } else {
      out += ch;
    }
  }
  return out;
}

function normalizeKanaForCer(text) {
  return expandChoon(
    toHiragana(String(text || "")).replace(/[^\u3041-\u309fー]/g, "")
  );
}

/** Levenshtein CER */
function cer(ref, hyp) {
  const a = [...ref];
  const b = [...hyp];
  const n = a.length;
  const m = b.length;
  if (!n) return m ? 1 : 0;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[n][m] / n;
}

/**
 * ruby HTML → 連続読み（ひらがな）。
 * wrapFuriganaWord の span ごと data-reading / data-surface を取る（属性途中マッチ禁止）。
 * @param {string} html
 */
function htmlToReadingString(html) {
  let s = String(html || "");
  s = s.replace(
    /<span\b[^>]*\byt-furigana-word\b[^>]*>[\s\S]*?<\/span>/gi,
    (block) => {
      const surface = /data-surface="([^"]*)"/.exec(block)?.[1] ?? "";
      const readingRaw = /data-reading="([^"]*)"/.exec(block)?.[1] ?? "";
      const tipRaw = /data-tip="([^"]*)"/.exec(block)?.[1] ?? "";
      const reading = normalizeReading(readingRaw || tipRaw);
      if (reading) return reading;
      return surface
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"');
    }
  );
  s = s.replace(/<ruby>[\s\S]*?<rt>([\s\S]*?)<\/rt><\/ruby>/gi, (_, rt) =>
    normalizeReading(rt.replace(/<[^>]+>/g, ""))
  );
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  return normalizeKanaForCer(s);
}

async function ensureFile(url, dest) {
  if (existsSync(dest) && readFileSync(dest).byteLength > 100) return dest;
  mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Downloading ${path.basename(dest)}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function loadGzJson(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) return {};
  return JSON.parse(gunzipSync(readFileSync(full)).toString("utf8"));
}

function clearPhraseDicts() {
  installNeologdPhrasesForTests({});
  installPlaceNamePhrasesForTests({});
  installStationPhrasesForTests({});
  installUnidicPhrasesForTests({});
  installJoyoJukujiPhrasesForTests({});
  installJaFuriganaPhrasesForTests({});
  installWikidataKanaPhrasesForTests({});
  installSudachiFullPhrasesForTests({});
  installCorporateNamePhrasesForTests({});
  installPersonalNamePhrasesForTests({});
  // sudachi-only 比較用: 製品向け定読みは載せない
  rebuildCombinedPhraseTrie({ includeProductReadings: false });
}

const WITH_CORPORATE = process.argv.includes("--with-corporate");

function loadFullPhraseDicts() {
  // 法人名 ~1.3M は Node 既定ヒープで OOM しやすい。公開 G2P にはほぼ無関係なので既定オフ。
  installNeologdPhrasesForTests(loadGzJson("dict/neologd-phrases.json.gz"));
  installUnidicPhrasesForTests(loadGzJson("dict/unidic-phrases.json.gz"));
  installJoyoJukujiPhrasesForTests(loadGzJson("dict/joyo-jukuji-phrases.json.gz"));
  installJaFuriganaPhrasesForTests(loadGzJson("dict/ja-furigana-phrases.json.gz"));
  installWikidataKanaPhrasesForTests(loadGzJson("dict/wikidata-kana-phrases.json.gz"));
  installSudachiFullPhrasesForTests(loadGzJson("dict/sudachi-full-phrases.json.gz"));
  installPlaceNamePhrasesForTests(loadGzJson("dict/place-name-phrases.json.gz"));
  installStationPhrasesForTests(loadGzJson("dict/station-phrases.json.gz"));
  if (WITH_CORPORATE) {
    installCorporateNamePhrasesForTests(
      loadGzJson("dict/corporate-name-phrases.json.gz")
    );
  } else {
    installCorporateNamePhrasesForTests({});
  }
  installPersonalNamePhrasesForTests(
    loadGzJson("dict/personal-name-phrases.json.gz")
  );
  const kanji = loadGzJson("dict/kanji-readings.json.gz");
  if (kanji && typeof kanji === "object") installKanjiReadingsForTests(kanji);
  rebuildCombinedPhraseTrie();
}

function createKuromojiTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.join(root, "dict") })
      .build((err, tokenizer) => {
        if (err) reject(err);
        else resolve((text) => tokenizer.tokenize(text));
      });
  });
}

/**
 * fugashi で全文カタカナ読み（ベースライン）。
 * @param {string[]} texts
 */
function fugashiReadings(texts) {
  const py = path.join(root, ".venv-reading", "bin", "python");
  if (!existsSync(py)) return null;
  const script = `
import sys, json
from fugashi import Tagger
tagger = Tagger()
for line in sys.stdin:
    text = line.rstrip("\\n")
    out = []
    for w in tagger(text):
        feat = w.feature
        kana = getattr(feat, "kana", None) or getattr(feat, "pron", None) or ""
        if not kana or kana == "*":
            kana = w.surface
        out.append(kana)
    print("".join(out))
`;
  const input = texts.map((t) => t.replace(/\n/g, " ")).join("\n") + "\n";
  const r = spawnSync(py, ["-c", script], {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (r.status !== 0) {
    console.warn("fugashi baseline failed:", r.stderr?.slice(0, 400));
    return null;
  }
  return r.stdout.trimEnd().split("\n");
}

function scoreG2pItems(items, tokenize, label, logTag = "ja-tts-g2p") {
  const byCat = {};
  let passed = 0;
  let stimCerSum = 0;
  const failed = [];
  for (const item of items) {
    const html = buildFuriganaHtml(item.surface, tokenize);
    const evaluation = evaluateRubyAgainstExpect(html, [
      { surface: item.target, reading: item.reading_expected }
    ]);
    const ok = evaluation.ok;
    if (ok) passed += 1;
    else {
      const got =
        evaluation.results[0]?.got ||
        extractReadingsFromRubyHtml(html).get(item.target) ||
        null;
      failed.push({
        id: item.id,
        category: item.category,
        target: item.target,
        want: item.reading_expected,
        alt: item.reading_alt,
        got
      });
    }
    if (item.stim_expected) {
      stimCerSum += cer(
        normalizeKanaForCer(item.stim_expected),
        htmlToReadingString(html)
      );
    }
    const c = item.category || "unknown";
    if (!byCat[c]) byCat[c] = { passed: 0, total: 0 };
    byCat[c].total += 1;
    if (ok) byCat[c].passed += 1;
  }
  const total = items.length;
  const rate = total ? passed / total : 0;
  const stimCer = total ? stimCerSum / total : 1;
  console.log(
    `[${logTag}] ${label}: ${passed}/${total} (${(100 * rate).toFixed(1)}%)` +
      ` stimCER=${(100 * stimCer).toFixed(2)}%` +
      (failed.length ? `  failed=${failed.length}` : "")
  );
  for (const [cat, s] of Object.entries(byCat).sort()) {
    console.log(
      `  ${cat}: ${s.passed}/${s.total} (${((100 * s.passed) / s.total).toFixed(0)}%)`
    );
  }
  return {
    label,
    passed,
    total,
    rate,
    stimCer,
    byCat,
    failed: failed.slice(0, 40)
  };
}

/**
 * Joyo Kanji Yomi: 対象漢字の <> マーク読みがルビと一致するか。
 * @param {Array<{key:string,normalized_text:string,normalized_pron:string}>} rows
 */
function scoreJoyoItems(rows, tokenize, label) {
  let passed = 0;
  const failed = [];
  for (const row of rows) {
    const key = String(row.key || "");
    const km = key.match(/^(.+)_(.+)_(\d+)$/);
    if (!km) continue;
    const target = km[1];
    const mark = /<([^>]+)>/.exec(String(row.normalized_pron || ""));
    const want = toHiragana(mark?.[1] || km[2]);
    const lemma = toHiragana(km[2]);
    const html = buildFuriganaHtml(row.normalized_text, tokenize);
    const evaluation = evaluateRubyAgainstExpect(html, [
      { surface: target, reading: want }
    ]);
    // 活用でマークが短くなる場合は見出し読みでも可
    const ok =
      evaluation.ok ||
      evaluateRubyAgainstExpect(html, [{ surface: target, reading: lemma }])
        .ok;
    if (ok) passed += 1;
    else {
      failed.push({
        id: key,
        target,
        want,
        lemma,
        got: evaluation.results[0]?.got || null
      });
    }
  }
  const total = rows.length;
  const rate = total ? passed / total : 0;
  console.log(
    `[joyo-kanji-yomi] ${label}: ${passed}/${total} (${(100 * rate).toFixed(1)}%)` +
      (failed.length ? `  failed=${failed.length}` : "")
  );
  return { label, passed, total, rate, failed: failed.slice(0, 30) };
}

function scoreJvsCer(rows, hypFn, label) {
  let sum = 0;
  let n = 0;
  const worst = [];
  for (const row of rows) {
    const ref = normalizeKanaForCer(row.kana);
    const hyp = normalizeKanaForCer(hypFn(row));
    const c = cer(ref, hyp);
    sum += c;
    n += 1;
    if (worst.length < 8 || c > worst[worst.length - 1].cer) {
      worst.push({
        base: row.base,
        cer: c,
        text: row.text.slice(0, 40),
        ref: ref.slice(0, 40),
        hyp: hyp.slice(0, 40)
      });
      worst.sort((a, b) => b.cer - a.cer);
      if (worst.length > 8) worst.length = 8;
    }
  }
  const avg = n ? sum / n : 1;
  console.log(
    `[jvs-nonpara-kana] ${label}: CER=${(100 * avg).toFixed(2)}% (n=${n})`
  );
  return { label, cer: avg, n, worst };
}

function wilsonInterval(passed, total, z = 1.96) {
  if (!total) return [0, 0];
  const p = passed / total;
  const den = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin =
    z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return [(center - margin) / den, (center + margin) / den];
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const g2pPath = await ensureFile(
    G2P_URL,
    path.join(cacheDir, "items_read_bench_v1.jsonl")
  );
  const blindspotPath = await ensureFile(
    G2P_BLINDSPOT_URL,
    path.join(cacheDir, "items_blindspot_v1.jsonl")
  );
  const yomiPath = await ensureFile(
    YOMI_BENCH_URL,
    path.join(cacheDir, "yomi-bench-kanji-multiple-fewshot-0.jsonl")
  );
  const jvsPath = await ensureFile(
    JVS_URL,
    path.join(cacheDir, "jvs_nonpara_kana.csv")
  );
  const joyoPath = await ensureFile(
    JOYO_URL,
    path.join(cacheDir, "joyo-kanji-yomi-common_kanji_source.jsonl")
  );
  const joyoParakeetPath =
    JOYO_PARAKEET_LIMIT > 0
      ? await ensureFile(
          JOYO_PARAKEET_URL,
          path.join(cacheDir, "joyo-kanji-yomi-parakeet.jsonl")
        )
      : null;

  const g2pAll = (await loadJsonl(g2pPath)).filter((r) => !r.benchmark_exclude);
  console.log(`ja-tts-g2p scored items: ${g2pAll.length}`);
  const blindspotAll = (await loadJsonl(blindspotPath)).filter(
    (r) => !r.benchmark_exclude
  );
  console.log(`ja-tts-g2p blindspot items: ${blindspotAll.length}`);
  const yomiAll = parseYomiBenchRows(await loadJsonl(yomiPath));
  console.log(`YOMI-Bench parsed items: ${yomiAll.length}`);

  const joyoAll =
    JOYO_LIMIT > 0 ? (await loadJsonl(joyoPath)).slice(0, JOYO_LIMIT) : [];
  console.log(`joyo-kanji-yomi items: ${joyoAll.length} (limit=${JOYO_LIMIT})`);
  const joyoParakeetAll =
    joyoParakeetPath && JOYO_PARAKEET_LIMIT > 0
      ? (await loadJsonl(joyoParakeetPath)).slice(0, JOYO_PARAKEET_LIMIT)
      : [];
  console.log(
    `joyo-parakeet items: ${joyoParakeetAll.length} (limit=${JOYO_PARAKEET_LIMIT})`
  );

  const jvsRows = readFileSync(jvsPath, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      // CSV: base,text,kana — text/kana may contain commas rarely; use first comma + last
      const i1 = line.indexOf(",");
      const i2 = line.indexOf(",", i1 + 1);
      if (i1 < 0 || i2 < 0) return null;
      return {
        base: line.slice(0, i1),
        text: line.slice(i1 + 1, i2),
        kana: line.slice(i2 + 1)
      };
    })
    .filter(Boolean)
    .slice(0, JVS_LIMIT);
  console.log(`JVS rows for CER: ${jvsRows.length} (limit=${JVS_LIMIT})`);

  const sudachi = await createBenchTokenizer();
  const kuromojiTok = await createKuromojiTokenizer();

  let learned = null;
  try {
    learned = JSON.parse(readFileSync(learnedOverridesPath(), "utf8"));
  } catch {
    learned = null;
  }

  // --- internal gates ---
  const internal = {};
  if (!SKIP_INTERNAL) {
    for (const [id, rel] of [
      ["seed-bench", "data/learning/seed-bench.jsonl"],
      ["hard-heteronym", "data/learning/benches/hard-heteronym.jsonl"],
      ["easy-regression", "data/learning/benches/easy-regression.jsonl"]
    ]) {
      loadFullPhraseDicts();
      const cases = await loadJsonl(path.join(root, rel));
      const run = await runSeedBench(
        cases.map((c) => ({ ...c, expect: c.expect || [] })),
        sudachi,
        learned
      );
      internal[id] = {
        passed: run.passed,
        total: run.total,
        rate: run.total ? run.passed / run.total : 0
      };
      console.log(
        `[internal] ${id}: ${run.passed}/${run.total} (${(100 * internal[id].rate).toFixed(1)}%)`
      );
    }
  } else {
    console.log("[internal] skipped (--skip-internal)");
  }

  // --- ja-tts-g2p ---
  const g2pResults = [];

  clearPhraseDicts();
  g2pResults.push(scoreG2pItems(g2pAll, sudachi, "sudachi-only"));

  clearPhraseDicts();
  g2pResults.push(scoreG2pItems(g2pAll, kuromojiTok, "kuromoji-only"));

  loadFullPhraseDicts();
  g2pResults.push(
    scoreG2pItems(g2pAll, sudachi, "yt-furigana (Sudachi+phrases+context)")
  );

  loadFullPhraseDicts();
  g2pResults.push(
    scoreG2pItems(g2pAll, kuromojiTok, "yt-furigana (Kuromoji+phrases+context)")
  );

  // --- ja-tts blindspot ---
  const blindspotResults = [];
  if (blindspotAll.length) {
    clearPhraseDicts();
    blindspotResults.push(
      scoreG2pItems(blindspotAll, sudachi, "sudachi-only", "ja-tts-blindspot")
    );
    loadFullPhraseDicts();
    blindspotResults.push(
      scoreG2pItems(
        blindspotAll,
        sudachi,
        "yt-furigana (Sudachi+phrases+context)",
        "ja-tts-blindspot"
      )
    );
  }

  // --- YOMI-Bench（語内漢字・複数読み） ---
  const yomiResults = [];
  if (yomiAll.length) {
    clearPhraseDicts();
    yomiResults.push(
      scoreG2pItems(yomiAll, sudachi, "sudachi-only", "yomi-bench")
    );
    loadFullPhraseDicts();
    yomiResults.push(
      scoreG2pItems(
        yomiAll,
        sudachi,
        "yt-furigana (Sudachi+phrases+context)",
        "yomi-bench"
      )
    );
  }

  // --- JVS CER ---
  const jvsResults = [];
  if (jvsRows.length) {
    loadFullPhraseDicts();
    jvsResults.push(
      scoreJvsCer(
        jvsRows,
        (row) => htmlToReadingString(buildFuriganaHtml(row.text, sudachi)),
        "yt-furigana Sudachi+phrases"
      )
    );
    clearPhraseDicts();
    jvsResults.push(
      scoreJvsCer(
        jvsRows,
        (row) => htmlToReadingString(buildFuriganaHtml(row.text, sudachi)),
        "sudachi-only"
      )
    );

    const fugashiHyps = fugashiReadings(jvsRows.map((r) => r.text));
    if (fugashiHyps && fugashiHyps.length === jvsRows.length) {
      let i = 0;
      jvsResults.push(
        scoreJvsCer(jvsRows, () => fugashiHyps[i++], "fugashi UniDic")
      );
    }
  } else {
    console.log("[jvs-nonpara-kana] skipped (limit=0)");
  }

  // --- Joyo Kanji Yomi 元（MIT） ---
  const joyoResults = [];
  if (joyoAll.length) {
    clearPhraseDicts();
    joyoResults.push(scoreJoyoItems(joyoAll, sudachi, "sudachi-only"));
    loadFullPhraseDicts();
    joyoResults.push(
      scoreJoyoItems(joyoAll, sudachi, "yt-furigana (Sudachi+phrases+context)")
    );
  } else {
    console.log("[joyo-kanji-yomi] skipped (limit=0)");
  }

  // --- JKYB-Parakeet（MIT・修正＋付表） ---
  const joyoParakeetResults = [];
  if (joyoParakeetAll.length) {
    clearPhraseDicts();
    joyoParakeetResults.push(
      scoreJoyoParakeetItems(
        joyoParakeetAll,
        sudachi,
        (text, tok) => buildFuriganaHtml(text, tok),
        "sudachi-only"
      )
    );
    loadFullPhraseDicts();
    joyoParakeetResults.push(
      scoreJoyoParakeetItems(
        joyoParakeetAll,
        sudachi,
        (text, tok) => buildFuriganaHtml(text, tok),
        "yt-furigana (Sudachi+phrases+context)"
      )
    );
  } else {
    console.log("[joyo-parakeet] skipped (limit=0)");
  }

  const bestG2p = g2pResults.reduce((a, b) => (a.rate >= b.rate ? a : b));
  const [lo, hi] = wilsonInterval(bestG2p.passed, bestG2p.total);
  const bestJoyo = joyoResults.length
    ? joyoResults.reduce((a, b) => (a.rate >= b.rate ? a : b))
    : null;
  const bestJoyoParakeet = joyoParakeetResults.length
    ? joyoParakeetResults.reduce((a, b) => (a.rate >= b.rate ? a : b))
    : null;
  const bestBlindspot = blindspotResults.length
    ? blindspotResults.reduce((a, b) => (a.rate >= b.rate ? a : b))
    : null;
  const bestYomi = yomiResults.length
    ? yomiResults.reduce((a, b) => (a.rate >= b.rate ? a : b))
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    datasets: [
      {
        id: "ja-tts-g2p-bench",
        license: "MIT",
        url: "https://github.com/filmapp/ja-tts-g2p-bench",
        article:
          "https://zenn.dev/tellernovel_inc/articles/ja-tts-g2p-benchmark",
        note: "Text-side target reading accuracy on the same 151 items (TTS audio scores are a different modality)."
      },
      {
        id: "ja-tts-g2p-blindspot",
        license: "MIT",
        url: "https://github.com/filmapp/ja-tts-g2p-bench",
        note: "Additional 151 LLM-generated blindspot items (text-side target reading)."
      },
      {
        id: "YOMI-Bench",
        license: "MIT",
        url: "https://github.com/benchmark-release/YOMI-Bench",
        note: "Kanji-in-word multiple reading prediction (377 items, text-side)."
      },
      {
        id: "jvs_nonpara_kana",
        license: "CC BY-SA 4.0 (eval cache only; not bundled)",
        url: "https://github.com/CyberAgentAILab/jvs_nonpara_kana",
        note: "Full-sentence kana CER vs manual annotations (Interspeech 2026)."
      },
      {
        id: "joyo-kanji-yomi-benchmark",
        license: "MIT",
        url: "https://huggingface.co/datasets/sbintuitions/joyo-kanji-yomi-benchmark",
        note: "Kanji-level reading match on Joyo polyphony sentences (text-side)."
      },
      {
        id: "joyo-kanji-yomi-benchmark-parakeet",
        license: "MIT",
        url: "https://huggingface.co/datasets/Parakeet-Inc/joyo-kanji-yomi-benchmark-parakeet",
        article:
          "https://zenn.dev/parakeet_tech/articles/936532be817118",
        note: "Corrected Joyo bench + appendix jukujikun. Target natural readings (text-side)."
      },
      {
        id: "o24s/japanese-g2p-benchmark",
        license: "code Apache-2.0 / data CC BY-SA 4.0",
        url: "https://github.com/o24s/japanese-g2p-benchmark",
        note: "Published KER baselines for OpenJTalk/Haqumei (reference)."
      },
      {
        id: "internal-seed-hard-easy",
        license: "project",
        url: "data/learning/"
      }
    ],
    publishedTtsLeaderboardRef: [
      { engine: "gemini-3.1-flash-tts-preview", acc: 0.801 },
      { engine: "gemini-2.5-pro-tts", acc: 0.775 },
      { engine: "voicevox (OpenJTalk dict)", acc: 0.695 },
      { engine: "openai gpt-4o-mini-tts", acc: 0.563 },
      { engine: "qwen3-tts-flash", acc: 0.523 }
    ],
    publishedFullSentenceKerRef: [
      {
        engine: "haqumei (best KER-no_lvs)",
        ker: 0.0164,
        source: "o24s/japanese-g2p-benchmark results.tsv"
      },
      {
        engine: "pyopenjtalk-plus",
        ker: 0.0168,
        source: "o24s/japanese-g2p-benchmark results.tsv"
      },
      {
        engine: "pyopenjtalk",
        ker: 0.0502,
        source: "o24s/japanese-g2p-benchmark results.tsv"
      }
    ],
    internal,
    jaTtsG2p: g2pResults.map((r) => ({
      ...r,
      wilson95: wilsonInterval(r.passed, r.total)
    })),
    jaTtsBlindspot: blindspotResults.map((r) => ({
      ...r,
      wilson95: wilsonInterval(r.passed, r.total)
    })),
    yomiBench: yomiResults.map((r) => ({
      ...r,
      wilson95: wilsonInterval(r.passed, r.total)
    })),
    jvsCer: jvsResults,
    joyoKanjiYomi: joyoResults.map((r) => ({
      ...r,
      wilson95: wilsonInterval(r.passed, r.total)
    })),
    joyoParakeet: joyoParakeetResults.map((r) => ({
      ...r,
      wilson95: wilsonInterval(r.passed, r.total)
    })),
    headline: {
      bestLabel: bestG2p.label,
      accuracy: bestG2p.rate,
      passed: bestG2p.passed,
      total: bestG2p.total,
      wilson95: [lo, hi],
      joyoBest: bestJoyo
        ? {
            label: bestJoyo.label,
            accuracy: bestJoyo.rate,
            passed: bestJoyo.passed,
            total: bestJoyo.total
          }
        : null,
      joyoParakeetBest: bestJoyoParakeet
        ? {
            label: bestJoyoParakeet.label,
            accuracy: bestJoyoParakeet.rate,
            passed: bestJoyoParakeet.passed,
            total: bestJoyoParakeet.total
          }
        : null,
      blindspotBest: bestBlindspot
        ? {
            label: bestBlindspot.label,
            accuracy: bestBlindspot.rate,
            passed: bestBlindspot.passed,
            total: bestBlindspot.total
          }
        : null,
      yomiBest: bestYomi
        ? {
            label: bestYomi.label,
            accuracy: bestYomi.rate,
            passed: bestYomi.passed,
            total: bestYomi.total
          }
        : null
    }
  };

  const outJson = path.join(outDir, "public-g2p-bench-latest.json");
  writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote ${outJson}`);

  // Pages 用スリム JSON（failed 配列を落とす）
  if (!NO_SITE) {
    const siteJson = path.join(root, "site", "data", "public-g2p-bench.json");
    mkdirSync(path.dirname(siteJson), { recursive: true });
    const slim = {
      generatedAt: report.generatedAt,
      headline: report.headline,
      jaTtsG2p: report.jaTtsG2p.map(({ failed: _f, ...rest }) => rest),
      jaTtsBlindspot: report.jaTtsBlindspot.map(({ failed: _f, ...rest }) => rest),
      yomiBench: report.yomiBench.map(({ failed: _f, ...rest }) => rest),
      joyoKanjiYomi: report.joyoKanjiYomi.map(
        ({ failed: _f, ...rest }) => rest
      ),
      joyoParakeet: report.joyoParakeet.map(({ failed: _f, ...rest }) => rest),
      jvsCer: report.jvsCer.map(({ worst: _w, ...rest }) => rest),
      publishedTtsLeaderboardRef: report.publishedTtsLeaderboardRef,
      caveat: report.datasets?.[0]?.note
    };
    writeFileSync(siteJson, `${JSON.stringify(slim, null, 2)}\n`);
    console.log(`Wrote ${siteJson}`);
  } else {
    console.log("[site] skipped (--no-site)");
  }

  console.log(
    `HEADLINE ${bestG2p.label}: ${(100 * bestG2p.rate).toFixed(1)}% ` +
      `(${bestG2p.passed}/${bestG2p.total}, 95% CI ${(100 * lo).toFixed(0)}–${(100 * hi).toFixed(0)}%)`
  );
  if (bestJoyo) {
    console.log(
      `JOYO ${bestJoyo.label}: ${(100 * bestJoyo.rate).toFixed(1)}% ` +
        `(${bestJoyo.passed}/${bestJoyo.total})`
    );
  }
  if (bestJoyoParakeet) {
    console.log(
      `JOYO-PARAKEET ${bestJoyoParakeet.label}: ${(100 * bestJoyoParakeet.rate).toFixed(1)}% ` +
        `(${bestJoyoParakeet.passed}/${bestJoyoParakeet.total})`
    );
  }
  if (bestBlindspot) {
    console.log(
      `BLINDSPOT ${bestBlindspot.label}: ${(100 * bestBlindspot.rate).toFixed(1)}% ` +
        `(${bestBlindspot.passed}/${bestBlindspot.total})`
    );
  }
  if (bestYomi) {
    console.log(
      `YOMI ${bestYomi.label}: ${(100 * bestYomi.rate).toFixed(1)}% ` +
        `(${bestYomi.passed}/${bestYomi.total})`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
