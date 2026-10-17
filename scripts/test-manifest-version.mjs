// 拡張の manifest で、表示用の version_name が version と食い違っていないこと。
// Chrome は version_name を優先して表示するため、version だけ上げると古い版に見えていた。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const rel of ["manifest.json", "extensions/yt-superchat-furigana/manifest.json"]) {
  const manifest = JSON.parse(readFileSync(path.join(root, rel), "utf8"));
  if ("version_name" in manifest) {
    assert.equal(manifest.version_name, manifest.version, `${rel}: version_name が version と違う`);
  }
}
console.log("manifest の版表示のテスト: 問題なし");
