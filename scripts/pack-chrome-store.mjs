#!/usr/bin/env node
/**
 * Build extension + zip for Chrome Web Store upload.
 * Also writes placeholder store screenshots (1280x800).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist-store");
const zipPath = path.join(outDir, "yt-furigana-extension.zip");
const shotsDir = path.join(root, "store", "screenshots");

const INCLUDE = [
  "manifest.json",
  "popup",
  "styles",
  "icons",
  "dist",
  "dict",
  "rules",
  "licenses",
  "COPYING",
  "LICENSE",
  "NOTICE"
];

function createPng(width, height, paint) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = paint(x, y, width, height);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
      crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const compressed = deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, crc]);
  };

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function writeScreenshots() {
  mkdirSync(shotsDir, { recursive: true });
  const w = 1280;
  const h = 800;
  const paintHero = (x, y) => {
    const paper = [243, 239, 230];
    const vermilion = [194, 59, 34];
    const inBar = y < 72;
    const inHero = y > 180 && y < 420 && x > 80 && x < 720;
    if (inBar) return vermilion;
    if (inHero) return [28, 25, 23];
    const edge = x < 4 || y < 4 || x >= w - 4 || y >= h - 4;
    if (edge) return vermilion;
    return paper;
  };
  const paintCaption = (x, y) => {
    const dark = [20, 18, 16];
    const caption = [255, 255, 255];
    const ruby = [220, 80, 60];
    if (y > 560 && y < 700 && x > 200 && x < 1080) {
      if (y < 600) return ruby;
      return caption;
    }
    return dark;
  };
  writeFileSync(
    path.join(shotsDir, "01-hero-1280x800.png"),
    createPng(w, h, paintHero)
  );
  writeFileSync(
    path.join(shotsDir, "02-caption-1280x800.png"),
    createPng(w, h, paintCaption)
  );
  console.log(`Screenshots → ${shotsDir}`);
}

function main() {
  console.log("Building…");
  const build = spawnSync("node", ["scripts/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (build.status !== 0) process.exit(build.status || 1);

  writeScreenshots();
  mkdirSync(outDir, { recursive: true });
  if (existsSync(zipPath)) unlinkSync(zipPath);

  const entries = INCLUDE.filter((p) => existsSync(path.join(root, p)));
  const result = spawnSync("zip", ["-r", "-q", zipPath, ...entries], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "zip failed");
    process.exit(result.status || 1);
  }

  const mb = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Store zip → ${zipPath} (${mb} MB)`);
  console.log("Upload this zip in Chrome Web Store Developer Dashboard.");
}

main();
