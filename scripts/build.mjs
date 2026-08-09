import { build, context } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
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

async function copyPersonalNamePhrases() {
  const source = path.join(root, "data", "generated", "personal-name-phrases.json.gz");
  const target = path.join(root, "dict", "personal-name-phrases.json.gz");
  const siteJsonSrc = path.join(root, "data", "generated", "personal-name-phrases.json");
  const siteJsonDst = path.join(root, "site", "personal-name-phrases.json");
  if (!existsSync(source)) {
    console.warn(
      "Personal-name phrases missing. Run: node scripts/build-personal-name-phrases.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  if (existsSync(siteJsonSrc)) {
    await cp(siteJsonSrc, siteJsonDst, { force: true });
  }
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`Personal-name phrases ready (${sizeMb.toFixed(2)} MB gz)`);
}

async function copyPlaceNamePhrases() {
  const source = path.join(root, "data", "generated", "place-name-phrases.json.gz");
  const target = path.join(root, "dict", "place-name-phrases.json.gz");
  const siteJsonSrc = path.join(root, "data", "generated", "place-name-phrases-site.json");
  const siteJsonDst = path.join(root, "site", "place-name-phrases.json");
  if (!existsSync(source)) {
    console.warn(
      "Place-name phrases missing. Run: node scripts/build-place-name-phrases.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  if (existsSync(siteJsonSrc)) {
    await cp(siteJsonSrc, siteJsonDst, { force: true });
  }
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`Place-name phrases ready (${sizeMb.toFixed(2)} MB gz)`);
  if (existsSync(siteJsonDst)) {
    const siteKb = statSync(siteJsonDst).size / 1024;
    console.log(`Place-name site subset ready (${siteKb.toFixed(0)} KB)`);
  }
}

async function copyStationPhrases() {
  const source = path.join(root, "data", "generated", "station-phrases.json.gz");
  const target = path.join(root, "dict", "station-phrases.json.gz");
  const siteJsonSrc = path.join(root, "data", "generated", "station-phrases-site.json");
  const siteJsonDst = path.join(root, "site", "station-phrases.json");
  if (!existsSync(source)) {
    console.warn(
      "Station phrases missing. Run: node scripts/build-station-phrases.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  if (existsSync(siteJsonSrc)) {
    await cp(siteJsonSrc, siteJsonDst, { force: true });
  }
  const sizeKb = statSync(target).size / 1024;
  console.log(`Station phrases ready (${sizeKb.toFixed(0)} KB gz)`);
  if (existsSync(siteJsonDst)) {
    const siteKb = statSync(siteJsonDst).size / 1024;
    console.log(`Station site subset ready (${siteKb.toFixed(0)} KB)`);
  }
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

async function copyKanjiReadings() {
  const source = path.join(root, "data", "generated", "kanji-readings.json.gz");
  const target = path.join(root, "dict", "kanji-readings.json.gz");
  if (!existsSync(source)) {
    console.warn(
      "Kanji readings missing. Run: node scripts/build-kanji-readings.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  const sizeKb = statSync(target).size / 1024;
  console.log(`Kanji readings ready (${sizeKb.toFixed(0)} KB gz)`);
}

async function copyUnidicPhrases() {
  const source = path.join(root, "data", "generated", "unidic-phrases.json.gz");
  const target = path.join(root, "dict", "unidic-phrases.json.gz");
  const siteJsonSrc = path.join(root, "data", "generated", "unidic-phrases-site.json");
  const siteJsonDst = path.join(root, "site", "unidic-phrases.json");
  if (!existsSync(source)) {
    console.warn(
      "UniDic phrases missing. Run: node scripts/build-unidic-phrases.mjs"
    );
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force: true });
  if (existsSync(siteJsonSrc)) {
    await cp(siteJsonSrc, siteJsonDst, { force: true });
  }
  const sizeMb = statSync(target).size / (1024 * 1024);
  console.log(`UniDic phrases ready (${sizeMb.toFixed(2)} MB gz)`);
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

/**
 * CWS Red Titanium 対策: sudachi.js 内の Base64 WASM を別ファイルへ出す。
 * @returns {Promise<string>} dist/sudachi_bg.wasm の絶対パス
 */
async function extractSudachiWasm() {
  const sudachiJs = path.join(
    root,
    "node_modules",
    "sudachi-wasm333",
    "sudachi.js"
  );
  const outWasm = path.join(root, "dist", "sudachi_bg.wasm");
  if (!existsSync(sudachiJs)) {
    throw new Error("sudachi-wasm333/sudachi.js not found. Run npm install first.");
  }
  const source = await readFile(sudachiJs, "utf8");
  const marker = "const wasmBASE64 = '";
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error("wasmBASE64 not found in sudachi-wasm333/sudachi.js");
  }
  const q = start + marker.length;
  const end = source.indexOf("'", q);
  if (end < 0) {
    throw new Error("wasmBASE64 closing quote not found");
  }
  const bytes = Buffer.from(source.slice(q, end), "base64");
  // \0asm
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new Error("decoded Sudachi WASM missing magic header");
  }
  await mkdir(path.dirname(outWasm), { recursive: true });
  await writeFile(outWasm, bytes);
  const sizeMb = bytes.length / (1024 * 1024);
  console.log(`Sudachi WASM ready (${sizeMb.toFixed(2)} MB) → dist/sudachi_bg.wasm`);
  return outWasm;
}

/**
 * sudachi.js から Base64 WASM 定数と末尾の自動 initSync を除去する。
 * （巨大文字列は RegExp だと失敗しやすいので indexOf で切る）
 * @param {string} source
 */
export function stripSudachiInlineWasmSource(source) {
  const marker = "const wasmBASE64 = '";
  const start = source.indexOf(marker);
  if (start < 0) {
    return source;
  }
  const q = start + marker.length;
  const end = source.indexOf("'", q);
  if (end < 0) {
    throw new Error("sudachi wasmBASE64: closing quote not found");
  }
  // 閉じ引用符の直後の `;` まで飛ばす
  let after = end + 1;
  if (source[after] === ";") after += 1;
  let out =
    source.slice(0, start) +
    "/* wasmBASE64 extracted to dist/sudachi_bg.wasm (CWS readability) */\n" +
    source.slice(after);

  const autoInit = out.search(/\nlet bytes;\s*\nif \(typeof atob === 'function'\)/);
  if (autoInit >= 0) {
    out =
      out.slice(0, autoInit) +
      "\n/* auto initSync removed; extension calls default init(url) */\n";
  }

  if (
    out.includes("const wasmBASE64") ||
    out.includes("atob(wasmBASE64)") ||
    out.includes("AGFzbQE")
  ) {
    throw new Error(
      "sudachi-no-inline-wasm: failed to strip embedded WASM from sudachi.js"
    );
  }
  return out;
}

/**
 * esbuild: sudachi.js から Base64 埋め込みと自動 initSync を除去する。
 * （CWS が難読化と誤認するパターンを避ける）
 */
function sudachiNoInlineWasmPlugin() {
  return {
    name: "sudachi-no-inline-wasm",
    setup(buildApi) {
      buildApi.onLoad({ filter: /[/\\]sudachi\.js$/ }, async (args) => {
        if (!args.path.includes(`${path.sep}sudachi-wasm333${path.sep}`)) {
          return null;
        }
        const source = await readFile(args.path, "utf8");
        return {
          contents: stripSudachiInlineWasmSource(source),
          loader: "js"
        };
      });
    }
  };
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
      sudachiNoInlineWasmPlugin(),
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

  // 回帰防止: 完成物に WASM Base64 が戻っていないか
  const contentOut = path.join(root, "dist", "content.js");
  const bundled = await readFile(contentOut, "utf8");
  if (
    bundled.includes("AGFzbQE") ||
    bundled.includes("const wasmBASE64") ||
    bundled.includes("atob(wasmBASE64)")
  ) {
    throw new Error(
      "dist/content.js still contains inline Sudachi WASM (AGFzbQE/wasmBASE64). CWS will reject."
    );
  }
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
  await copyPlaceNamePhrases();
  await copyStationPhrases();
  await copyPersonalNamePhrases();
  await copyUnidicPhrases();
  await copyEnglishKatakana();
  await copyKanjiReadings();
  await copySudachiDict();
  await extractSudachiWasm();
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

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
