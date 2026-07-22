import { build, context } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const watch = process.argv.includes("--watch");

async function copyKuromojiDict() {
  const source = path.join(root, "node_modules", "kuromoji", "dict");
  const target = path.join(root, "dict");

  if (!existsSync(source)) {
    throw new Error("kuromoji dictionary not found. Run npm install first.");
  }

  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function copyNeologdPhrases() {
  const source = path.join(root, "data", "generated", "neologd-phrases.json.gz");
  const target = path.join(root, "dict", "neologd-phrases.json.gz");
  if (!existsSync(source)) {
    console.warn(
      "NEologd phrases missing. Run: node scripts/build-neologd-phrases.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`NEologd phrases ready (${sizeMb.toFixed(2)} MB gz)`);
}

async function copyEnglishKatakana() {
  const source = path.join(root, "data", "generated", "english-katakana.json.gz");
  const target = path.join(root, "dict", "english-katakana.json.gz");
  if (!existsSync(source)) {
    console.warn(
      "English katakana dict missing. Run: node scripts/build-english-katakana.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`English katakana dict ready (${sizeMb.toFixed(2)} MB gz)`);
}

async function copySudachiDict() {
  const source = path.join(
    root,
    "node_modules",
    "sudachi-wasm333",
    "resources",
    "system.dic"
  );
  const targetDir = path.join(root, "dict", "sudachi");
  const target = path.join(targetDir, "system.dic");

  if (!existsSync(source)) {
    throw new Error("Sudachi dictionary not found. Run npm install first.");
  }

  await mkdir(targetDir, { recursive: true });
  await cp(source, target, { force: true });
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`Sudachi dictionary ready (${sizeMb.toFixed(0)} MB)`);
}

function createBrandIconPng(size) {
  const width = size;
  const height = size;
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
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = width * 0.42;
  const paper = [248, 244, 236, 255];
  const ink = [28, 25, 23, 255];
  const verm = [194, 59, 34, 255];

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      let color = [0, 0, 0, 0];
      if (dist <= radius) {
        if (dist > radius * 0.92) {
          const a = Math.round((255 * (radius - dist)) / (radius * 0.08));
          color = [paper[0], paper[1], paper[2], a];
        } else if (Math.abs(dx) < width * 0.18 && dy > -height * 0.28 && dy < -height * 0.08) {
          color = verm;
        } else if (Math.abs(dx) < width * 0.08 && dy > -height * 0.05 && dy < height * 0.32) {
          color = ink;
        } else if (Math.abs(dy - height * 0.28) < height * 0.05 && Math.abs(dx) < width * 0.22) {
          color = ink;
        } else {
          color = paper;
        }
      }
      const pixelStart = rowStart + 1 + x * 4;
      raw[pixelStart] = color[0];
      raw[pixelStart + 1] = color[1];
      raw[pixelStart + 2] = color[2];
      raw[pixelStart + 3] = color[3];
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

async function generateIcons() {
  const iconsDir = path.join(root, "icons");
  await mkdir(iconsDir, { recursive: true });
  const existing = path.join(iconsDir, "icon128.png");
  if (existsSync(existing) && statSync(existing).size > 5000 && process.env.YT_FURIGANA_FORCE_ICONS !== "1") {
    console.log("Keeping existing brand icons");
    return;
  }
  for (const size of [16, 48, 128]) {
    await writeFile(path.join(iconsDir, `icon${size}.png`), createBrandIconPng(size));
  }
}

async function buildBackgroundScript() {
  const options = {
    entryPoints: [path.join(root, "src", "background.js")],
    outfile: path.join(root, "dist", "background.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome109"],
    logLevel: "info"
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("Watching background script...");
    return;
  }

  await build(options);
}

async function buildContentScript() {
  const kuromojiBrowserLoader = path.join(
    root,
    "node_modules",
    "kuromoji",
    "src",
    "loader",
    "BrowserDictionaryLoader.js"
  );

  const options = {
    entryPoints: [path.join(root, "src", "content.js")],
    outfile: path.join(root, "dist", "content.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    mainFields: ["browser", "module", "main"],
    target: ["chrome109"],
    logLevel: "info",
    banner: {
      js: "globalThis.__YTF_STORE_SAFE__=true;"
    },
    plugins: [
      {
        name: "kuromoji-browser",
        setup(buildApi) {
          buildApi.onResolve({ filter: /NodeDictionaryLoader\.js$/ }, () => ({
            path: kuromojiBrowserLoader
          }));

          buildApi.onResolve({ filter: /^path$/ }, () => ({
            path: path.join(root, "scripts", "shims", "path.js")
          }));
        }
      }
    ]
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("Watching content script...");
    return;
  }

  await build(options);
}

async function buildPageCaptionBridge() {
  const options = {
    entryPoints: [path.join(root, "src", "page-caption-bridge.js")],
    outfile: path.join(root, "dist", "page-caption-bridge.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome109"],
    logLevel: "info"
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("Watching page caption bridge...");
    return;
  }

  await build(options);
}

async function buildPopupScript() {
  const options = {
    entryPoints: [path.join(root, "src", "popup.js")],
    outfile: path.join(root, "dist", "popup.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["chrome109"],
    logLevel: "info"
  };

  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("Watching popup script...");
    return;
  }

  await build(options);
}

async function run() {
  await mkdir(path.join(root, "dist"), { recursive: true });
  await copyKuromojiDict();
  await copyNeologdPhrases();
  await copyEnglishKatakana();
  await copySudachiDict();
  await generateIcons();
  await buildBackgroundScript();
  await buildContentScript();
  if (process.env.YT_FURIGANA_BUILD_BRIDGE === "1") {
    await buildPageCaptionBridge();
  } else {
    console.log("Skipping page-caption-bridge (set YT_FURIGANA_BUILD_BRIDGE=1 to build)");
  }
  await buildPopupScript();
  console.log("Build complete.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
