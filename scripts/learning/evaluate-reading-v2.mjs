#!/usr/bin/env node
/**
 * 設計書「候補制約型ふりがな推定 v2」第0段階: 間違えやすい語の確認用データで、いまの正解率を記録する。
 * 合否は問わない（失敗を見える化するだけ）。指定した語の範囲の読みを厳密に比べる。
 *
 *   node scripts/learning/evaluate-reading-v2.mjs                 # 表示だけ
 *   node scripts/learning/evaluate-reading-v2.mjs --write-baseline # data/learning/reading-v2-baseline.json に記録
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFuriganaHtml } from "furigana-ruby-engine/lib/furigana.js";
import {
  createBenchTokenizer,
  learnedOverridesPath,
  loadJsonl,
  readingOfSpan
} from "./bench-utils.mjs";
import { applyLearnedOverridesNow } from "furigana-ruby-engine/lib/reading-context.js";
import { setDictionaryFileLoader } from "furigana-ruby-engine/lib/dict-gzip-fetch.js";
import { startCorePhraseDicts } from "furigana-ruby-engine/lib/phrase-dict-boot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const benchPath = path.join(root, "data/learning/benches/reading-v2-regression.jsonl");
const baselinePath = path.join(root, "data/learning/reading-v2-baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");

const cases = await loadJsonl(benchPath);

let learned = null;
try {
  learned = JSON.parse(await readFile(learnedOverridesPath(), "utf8"));
} catch {
  learned = null;
}

/** 本体の拡張と同じ: Sudachi（WASM、分割モード C）＋句辞書＋学習済みの上書き */
async function sudachiEngine() {
  // 拡張と同じく人名・地名などの句辞書を読み込む（読み込まないと人名の読みが使われない）
  setDictionaryFileLoader((name) => readFile(path.join(root, "dict", name)));
  await startCorePhraseDicts();
  const tokenize = await createBenchTokenizer();
  applyLearnedOverridesNow(learned || { phrases: {}, contextRules: [] });
  return (text) => buildFuriganaHtml(text, tokenize);
}

/** スパチャ拡張・npm パッケージと同じ: kuromoji（IPADIC）＋句辞書 */
async function kuromojiEngine() {
  const { createFuriganaEngine } = await import(
    path.join(root, "packages/furigana-ruby-engine/dist/index.js")
  );
  const engine = await createFuriganaEngine();
  return (text) => engine.toHtml(text);
}

const results = {};
for (const [name, make] of [
  ["sudachi", sudachiEngine],
  ["kuromoji", kuromojiEngine]
]) {
  const toHtml = await make();
  const byCategory = {};
  const failed = [];
  for (const c of cases) {
    const got = readingOfSpan(toHtml(c.text), c.text, c.surface, c.at || 0);
    const ok = got === c.reading;
    const cat = (byCategory[c.category] ||= { passed: 0, total: 0 });
    cat.total += 1;
    if (ok) cat.passed += 1;
    else failed.push({ id: c.id, surface: c.surface, want: c.reading, got: got ?? "（区切り違い）" });
  }
  const passed = Object.values(byCategory).reduce((a, b) => a + b.passed, 0);
  results[name] = { passed, total: cases.length, byCategory, failed };

  console.log(`\n■ ${name}: ${passed}/${cases.length}`);
  for (const [cat, v] of Object.entries(byCategory)) console.log(`  ${cat}: ${v.passed}/${v.total}`);
  for (const f of failed) console.log(`  × ${f.surface}: 正解 ${f.want} / 結果 ${f.got}`);
}

if (writeBaseline) {
  const payload = { ts: new Date().toISOString(), cases: cases.length, engines: results };
  await writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\n記録しました: ${path.relative(root, baselinePath)}`);
}
