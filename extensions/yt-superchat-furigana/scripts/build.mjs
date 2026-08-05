#!/usr/bin/env node
/**
 * YT Live Chat Furigana のバンドル。
 * 本体 src/furigana.js + kuromoji を同梱し、kuromoji 辞書だけ dict/ にコピーする。
 */
import * as esbuild from "esbuild";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extRoot, "../..");
const dist = path.join(extRoot, "dist");
const dictOut = path.join(extRoot, "dict");
const dictSrc = path.join(repoRoot, "dict");

await mkdir(dist, { recursive: true });
await mkdir(dictOut, { recursive: true });

// kuromoji の .dat.gz のみ + フレーズ辞書（sudachi は載せない）
const dictFiles = (await readdir(dictSrc)).filter((name) =>
  /\.dat\.gz$/i.test(name)
);
await Promise.all(
  dictFiles.map((name) =>
    copyFile(path.join(dictSrc, name), path.join(dictOut, name))
  )
);

for (const phraseName of [
  "neologd-phrases.json.gz",
  "personal-name-phrases.json.gz"
]) {
  const src = path.join(dictSrc, phraseName);
  try {
    await copyFile(src, path.join(dictOut, phraseName));
  } catch {
    /* optional */
  }
}

const kuromojiBrowserLoader = path.join(
  repoRoot,
  "node_modules",
  "kuromoji",
  "src",
  "loader",
  "BrowserDictionaryLoader.js"
);

const kuromojiPlugin = {
  name: "kuromoji-browser",
  setup(buildApi) {
    buildApi.onResolve({ filter: /NodeDictionaryLoader\.js$/ }, () => ({
      path: kuromojiBrowserLoader
    }));
    buildApi.onResolve({ filter: /^path$/ }, () => ({
      path: path.join(repoRoot, "scripts", "shims", "path.js")
    }));
  }
};

const common = {
  bundle: true,
  platform: "browser",
  target: ["chrome109"],
  logLevel: "info"
};

await Promise.all([
  esbuild.build({
    ...common,
    format: "esm",
    entryPoints: [path.join(extRoot, "src/background.js")],
    outfile: path.join(dist, "background.js")
  }),
  esbuild.build({
    ...common,
    // content_scripts は type:module 無しなので IIFE
    format: "iife",
    mainFields: ["browser", "module", "main"],
    entryPoints: [path.join(extRoot, "src/content.js")],
    outfile: path.join(dist, "content.js"),
    plugins: [kuromojiPlugin]
  }),
  esbuild.build({
    ...common,
    format: "esm",
    entryPoints: [path.join(extRoot, "popup/popup.js")],
    outfile: path.join(dist, "popup.js")
  }),
  copyFile(
    path.join(extRoot, "src/content.css"),
    path.join(dist, "content.css")
  )
]);

console.log(
  `YT Live Chat Furigana build complete → extensions/yt-superchat-furigana/dist (${dictFiles.length} dict files)`
);
