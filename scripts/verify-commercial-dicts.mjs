#!/usr/bin/env node
/**
 * 商用利用可能な公開辞書が揃っているか確認する。
 * kuromoji IPADic / SudachiDict / 派生フレーズが dict/ にあることを検証する。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
  // kuromoji / mecab-ipadic（ICOT Free Software — 商用可・帰属表示）
  "dict/base.dat.gz",
  "dict/cc.dat.gz",
  "dict/check.dat.gz",
  "dict/tid.dat.gz",
  "dict/tid_map.dat.gz",
  "dict/tid_pos.dat.gz",
  "dict/unk.dat.gz",
  "dict/unk_char.dat.gz",
  "dict/unk_compat.dat.gz",
  "dict/unk_invoke.dat.gz",
  "dict/unk_map.dat.gz",
  "dict/unk_pos.dat.gz",
  // SudachiDict（Apache-2.0、UniDic/NEologd 由来を含む — 商用可）
  "dict/sudachi/system.dic",
  // 派生フレーズ（NEologd seed / CMUdict — 商用可・帰属は third_party）
  "dict/neologd-phrases.json.gz",
  "dict/place-name-phrases.json.gz",
  "dict/corporate-name-phrases.json.gz",
  "dict/wikidata-kana-phrases.json.gz",
  "dict/sudachi-full-phrases.json.gz",
  "dict/unidic-phrases.json.gz",
  "dict/kanji-readings.json.gz",
  "dict/english-katakana.json.gz"
];

const ATTR = [
  "third_party/BSD-CMUdict.txt",
  "third_party/Unicode-License.txt",
  "third_party/BSD-UniDic.txt",
  "docs/TRADEMARK-AND-ATTRIBUTION.md"
];

let failed = 0;
for (const rel of REQUIRED) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    console.error(`missing: ${rel}`);
    failed += 1;
    continue;
  }
  const st = statSync(full);
  if (st.size < 100) {
    console.error(`too small: ${rel} (${st.size})`);
    failed += 1;
  }
}

for (const rel of ATTR) {
  if (!existsSync(path.join(root, rel))) {
    console.warn(`attribution file missing (warn): ${rel}`);
  }
}

const sudachi = path.join(root, "dict/sudachi/system.dic");
if (existsSync(sudachi)) {
  const head = readFileSync(sudachi).subarray(16, 24).toString("ascii");
  console.log(`SudachiDict build stamp: ${head.trim() || "(unknown)"}`);
  const md5 = createHash("md5").update(readFileSync(sudachi)).digest("hex");
  console.log(`SudachiDict md5: ${md5}`);
}

if (failed) {
  console.error(`dict commercial set check failed (${failed})`);
  process.exit(1);
}
console.log("Commercial-safe dictionary set OK (kuromoji IPADic + SudachiDict + phrases).");
