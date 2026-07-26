#!/usr/bin/env node
/**
 * YT Caption Overlay のバンドル。
 * site/caption-formats.js を共有して dist/ に出力する。
 */
import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

await mkdir(dist, { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome109"],
  logLevel: "info"
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, "src/background.js")],
    outfile: path.join(dist, "background.js")
  }),
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, "src/content.js")],
    outfile: path.join(dist, "content.js")
  }),
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, "popup/popup.js")],
    outfile: path.join(dist, "popup.js")
  }),
  copyFile(path.join(root, "src/content.css"), path.join(dist, "content.css"))
]);

console.log("YT Caption Overlay build complete → extensions/yt-caption-overlay/dist");
