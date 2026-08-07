#!/usr/bin/env node
/**
 * YT Live Chat Furigana — CWS 提出用 zip + キット生成。
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  cpSync,
  readFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extRoot = path.join(root, "extensions", "yt-superchat-furigana");
const outDir = path.join(root, "dist-store-superchat");
const zipPath = path.join(outDir, "yt-superchat-furigana.zip");
const kitDir = path.join(root, "store", "superchat-cws-upload");
const shotsDir = path.join(root, "store", "superchat-screenshots");

const INCLUDE = [
  "manifest.json",
  "popup",
  "icons",
  "dist",
  "dict",
  "README.md"
];

const FORBIDDEN = [".env", ".pem", "id_rsa", "node_modules", ".git"];

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
  // 実写／デモ撮影済みなら上書きしない（プレースホルダは小さい）
  if (!existsSync(filePath)) return true;
  return statSync(filePath).size < 8000;
}

function ensureShot(filePath, paint, w, h) {
  if (!shouldWriteShot(filePath)) return;
  writeFileSync(filePath, createPng(w, h, paint));
}

function writeScreenshots() {
  mkdirSync(shotsDir, { recursive: true });
  const w = 1280;
  const h = 800;
  // ライブ風の暗い背景 + 色付きスパチャ帯
  ensureShot(
    path.join(shotsDir, "01-hero-1280x800.png"),
    (x, y) => {
      if (y < 70) return [28, 28, 28];
      if (y > 220 && y < 340 && x > 720 && x < 1220) {
        if (y < 255) return [21, 101, 192];
        return [255, 255, 255];
      }
      if (y > 360 && y < 480 && x > 720 && x < 1220) {
        if (y < 395) return [194, 59, 34];
        return [255, 255, 255];
      }
      return [18, 18, 18];
    },
    w,
    h
  );
  ensureShot(
    path.join(shotsDir, "02-superchat-1280x800.png"),
    (x, y) => {
      if (y > 280 && y < 420 && x > 200 && x < 1080) {
        if (y < 320) return [156, 39, 176];
        return [250, 250, 250];
      }
      return [22, 22, 24];
    },
    w,
    h
  );
  ensureShot(
    path.join(shotsDir, "03-popup-1280x800.png"),
    (x, y) => {
      if (x > 460 && x < 820 && y > 180 && y < 520) return [246, 241, 232];
      return [40, 40, 42];
    },
    w,
    h
  );
  ensureShot(
    path.join(shotsDir, "promo-440x280.png"),
    (x, y, ww, hh) => {
      if (y < 48) return [194, 59, 34];
      if (y > hh * 0.35 && y < hh * 0.7 && x > ww * 0.1 && x < ww * 0.9) {
        return [255, 255, 255];
      }
      return [28, 28, 30];
    },
    440,
    280
  );
  ensureShot(
    path.join(shotsDir, "promo-1400x560.png"),
    (x, y, ww, hh) => {
      if (y < 64) return [194, 59, 34];
      if (y > hh * 0.3 && y < hh * 0.75 && x > ww * 0.08 && x < ww * 0.92) {
        return [250, 250, 250];
      }
      return [22, 22, 24];
    },
    1400,
    560
  );
}

function main() {
  console.log("Building YT Live Chat Furigana…");
  const build = spawnSync("npm", ["run", "superchat:build"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (build.status !== 0) process.exit(build.status || 1);

  if (!existsSync(path.join(extRoot, "dict"))) {
    console.error("Missing extensions/yt-superchat-furigana/dict — build failed to copy kuromoji dict");
    process.exit(1);
  }

  writeScreenshots();
  mkdirSync(outDir, { recursive: true });
  if (existsSync(zipPath)) unlinkSync(zipPath);

  const entries = INCLUDE.filter((p) => existsSync(path.join(extRoot, p)));
  const zipArgs = ["-r", "-q", zipPath, ...entries, "-x", "dist/*.map", "**/.DS_Store"];
  const result = spawnSync("zip", zipArgs, {
    cwd: extRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "zip failed");
    process.exit(result.status || 1);
  }

  const listing = spawnSync("zipinfo", ["-1", zipPath], { encoding: "utf8" });
  if (listing.status === 0) {
    const names = String(listing.stdout || "");
    for (const bad of FORBIDDEN) {
      if (names.includes(bad)) {
        console.error(`Zip must not contain ${bad}`);
        process.exit(1);
      }
    }
    if (!names.includes("dict/") || !names.includes("dist/content.js")) {
      console.error("Zip missing dict/ or dist/content.js");
      process.exit(1);
    }
  }

  mkdirSync(kitDir, { recursive: true });
  const shotOut = path.join(kitDir, "screenshots");
  mkdirSync(shotOut, { recursive: true });
  cpSync(zipPath, path.join(kitDir, "yt-superchat-furigana.zip"));
  cpSync(path.join(extRoot, "icons", "icon128.png"), path.join(kitDir, "icon128.png"));
  for (const name of [
    "01-hero-1280x800.png",
    "02-superchat-1280x800.png",
    "03-popup-1280x800.png"
  ]) {
    cpSync(path.join(shotsDir, name), path.join(shotOut, name));
  }
  cpSync(path.join(shotsDir, "promo-440x280.png"), path.join(kitDir, "promo-440x280.png"));
  cpSync(path.join(shotsDir, "promo-1400x560.png"), path.join(kitDir, "promo-1400x560.png"));

  const version = JSON.parse(
    readFileSync(path.join(extRoot, "manifest.json"), "utf8")
  ).version;

  // PASTE / CHECKLIST / README はリポジトリ側のソースをキットへコピー
  for (const name of ["PASTE.txt", "CHECKLIST.txt", "README.md", "listing.md"]) {
    const src = path.join(root, "store", "superchat", name);
    if (existsSync(src)) cpSync(src, path.join(kitDir, name));
  }

  writeFileSync(
    path.join(kitDir, "VERSION.txt"),
    `YT Live Chat Furigana ${version}\n`
  );

  const mb = (statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Store zip → ${zipPath} (${mb} MB)`);
  console.log(`CWS kit   → ${kitDir}`);

  // GitHub Release も同じ zip で更新（SKIP_GITHUB_RELEASE=1 で省略可）
  const release = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "github-release.mjs"), "--product", "live-chat"],
    { cwd: root, encoding: "utf8", stdio: "inherit" }
  );
  if (release.status !== 0) {
    console.error("GitHub Release 更新に失敗しました（zip 自体は作成済み）");
    process.exit(release.status || 1);
  }
}

main();
