#!/usr/bin/env node
/**
 * Build extension + zip for Chrome Web Store upload.
 * Screenshots: keep existing real captures; only write placeholders if missing/tiny.
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
  "third_party",
  "COPYING",
  "LICENSE",
  "NOTICE"
];

const FORBIDDEN_IN_ZIP = [
  ".env",
  "licenses.json",
  "stripe-orders.json",
  "contributions.jsonl",
  ".pem",
  "id_rsa"
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

function shouldWriteShot(filePath) {
  // Never overwrite existing screenshots once present (real or product mock).
  return !existsSync(filePath);
}

function writeScreenshots() {
  mkdirSync(shotsDir, { recursive: true });
  const w = 1280;
  const h = 800;
  const paintHero = (x, y) => {
    if (y < 64) return [194, 59, 34];
    if (y > 80 && y < 520) {
      const t = Math.abs(x - w / 2) / (w / 2);
      const v = Math.round(22 + 18 * t);
      return [v, v - 2, v - 4];
    }
    if (y > 560 && y < 720 && x > 160 && x < 1120) {
      if (y < 600) return [220, 90, 70];
      return [255, 255, 255];
    }
    return [243, 239, 230];
  };
  const paintCaption = (x, y) => {
    if (y < h * 0.55) return [18, 16, 14];
    if (y > h * 0.62 && y < h * 0.88 && x > w * 0.12 && x < w * 0.88) {
      if (y < h * 0.7) return [210, 70, 55];
      return [250, 250, 250];
    }
    return [18, 16, 14];
  };
  const heroPath = path.join(shotsDir, "01-hero-1280x800.png");
  const captionPath = path.join(shotsDir, "02-caption-1280x800.png");
  if (shouldWriteShot(heroPath)) {
    writeFileSync(heroPath, createPng(w, h, paintHero));
  }
  if (shouldWriteShot(captionPath)) {
    writeFileSync(captionPath, createPng(w, h, paintCaption));
  }
  console.log(`Screenshots → ${shotsDir}`);
}

function assertZipSafe() {
  const listing = spawnSync("zipinfo", ["-1", zipPath], {
    encoding: "utf8"
  });
  if (listing.status !== 0) {
    console.warn("zipinfo unavailable; skip zip secret scan");
    return;
  }
  const names = String(listing.stdout || "");
  for (const bad of FORBIDDEN_IN_ZIP) {
    if (names.includes(bad)) {
      console.error(`Store zip must not contain ${bad}`);
      process.exit(1);
    }
  }
  if (names.includes("page-caption-bridge.js")) {
    console.error("Store zip must not ship page-caption-bridge.js");
    process.exit(1);
  }
}

function main() {
  console.log("Building…");
  const build = spawnSync("node", ["scripts/build.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, YT_FURIGANA_BUILD_BRIDGE: "0" }
  });
  if (build.status !== 0) process.exit(build.status || 1);

  // Drop leftover bridge artifact from previous local builds
  const bridge = path.join(root, "dist", "page-caption-bridge.js");
  if (existsSync(bridge)) unlinkSync(bridge);

  writeScreenshots();
  mkdirSync(outDir, { recursive: true });
  if (existsSync(zipPath)) unlinkSync(zipPath);

  const entries = INCLUDE.filter((p) => existsSync(path.join(root, p)));
  // Exclude debug / non-store artifacts accidentally left in dist/
  const zipArgs = [
    "-r",
    "-q",
    zipPath,
    ...entries,
    "-x",
    "dist/page-caption-bridge.js",
    "dist/page-debug.js",
    "dist/*.map"
  ];
  const result = spawnSync("zip", zipArgs, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "zip failed");
    process.exit(result.status || 1);
  }

  assertZipSafe();

  const mb = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Store zip → ${zipPath} (${mb} MB)`);
  console.log("Upload this zip in Chrome Web Store Developer Dashboard.");
}

main();
