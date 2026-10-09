#!/usr/bin/env node
/**
 * furigana-ruby-engine のビルド: エンジン一式を 1 ファイルの ESM にまとめ、辞書とライセンスを同梱する。
 */
import * as esbuild from "esbuild";
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pkgRoot, "../..");

/** kuromoji 辞書 + コア句辞書（重い地名・企業名・NEologd 等は同梱しない） */
export const DICT_FILES = [
  "base.dat.gz",
  "check.dat.gz",
  "tid.dat.gz",
  "tid_pos.dat.gz",
  "tid_map.dat.gz",
  "cc.dat.gz",
  "unk.dat.gz",
  "unk_pos.dat.gz",
  "unk_map.dat.gz",
  "unk_char.dat.gz",
  "unk_compat.dat.gz",
  "unk_invoke.dat.gz",
  "joyo-jukuji-phrases.json.gz",
  "ja-furigana-phrases.json.gz",
  "kanji-readings.json.gz",
  "personal-name-phrases.json.gz",
  "station-phrases.json.gz",
  "english-katakana.json.gz"
];

await rm(path.join(pkgRoot, "dist"), { recursive: true, force: true });
await rm(path.join(pkgRoot, "dict"), { recursive: true, force: true });
await mkdir(path.join(pkgRoot, "dict"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(pkgRoot, "src/index.js")],
  outfile: path.join(pkgRoot, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: ["es2020"],
  mainFields: ["module", "main"],
  external: ["node:*"],
  logLevel: "info",
  plugins: [
    {
      name: "path-shim",
      setup(build) {
        // kuromoji の require("path") をブラウザでも動く最小実装へ
        build.onResolve({ filter: /^path$/ }, () => ({
          path: path.join(repoRoot, "scripts/shims/path.js")
        }));
      }
    }
  ]
});

// ルートの dict/ は git 管理外なので、CI でも揃う生成元から直接コピーする
const dictSource = (name) =>
  name.endsWith(".dat.gz")
    ? path.join(repoRoot, "node_modules/kuromoji/dict", name)
    : path.join(repoRoot, "data/generated", name);
await Promise.all(
  DICT_FILES.map((name) => copyFile(dictSource(name), path.join(pkgRoot, "dict", name)))
);
for (const name of ["LICENSE", "COPYING", "NOTICE"]) {
  await copyFile(path.join(repoRoot, name), path.join(pkgRoot, name));
}
await cp(path.join(repoRoot, "third_party"), path.join(pkgRoot, "third_party"), {
  recursive: true
});

console.log(`furigana-ruby-engine build complete (${DICT_FILES.length} dict files)`);
