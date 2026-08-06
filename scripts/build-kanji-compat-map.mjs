/**
 * joyokanji（Apache-2.0）の旧字体・人名異体字マップを取得し、
 * 読み照合用の互換マップを生成する。
 *
 * 表示表層は変えず、Kuromoji 等への照合キーだけ新字体へ寄せる用途。
 *
 * 出典: https://github.com/new-village/joyo-kanji
 * 出力: data/generated/kanji-compat-map.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache", "joyokanji");
const kanjiUrl =
  "https://raw.githubusercontent.com/new-village/joyo-kanji/main/joyokanji/config/kanji.json";
const variantsUrl =
  "https://raw.githubusercontent.com/new-village/joyo-kanji/main/joyokanji/config/variants.json";
const extraPath = path.join(root, "data", "kanji-compat-extra.json");
const outDir = path.join(root, "data", "generated");
const outJson = path.join(outDir, "kanji-compat-map.json");
const outMeta = path.join(outDir, "kanji-compat-map.meta.json");

async function fetchCached(url, filename) {
  mkdirSync(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, filename);
  if (existsSync(dest)) return JSON.parse(readFileSync(dest, "utf8"));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  const text = await res.text();
  writeFileSync(dest, text);
  return JSON.parse(text);
}

function loadExtra() {
  if (!existsSync(extraPath)) return {};
  const raw = JSON.parse(readFileSync(extraPath, "utf8"));
  if (!raw || typeof raw !== "object") return {};
  // "_comment" などメタキーは除外
  return Object.fromEntries(
    Object.entries(raw).filter(([k, v]) => !k.startsWith("_") && typeof v === "string")
  );
}

const kanji = await fetchCached(kanjiUrl, "kanji.json");
const variants = await fetchCached(variantsUrl, "variants.json");
const extra = loadExtra();

// 異体字・プロジェクト補完を旧字マップより優先（髙→高等）
const map = { ...kanji, ...variants, ...extra };

// 1コードポイント→1コードポイントのみ（表層長を保ってトークンを戻すため）
const filtered = {};
let skipped = 0;
for (const [from, to] of Object.entries(map)) {
  const fromChars = [...String(from)];
  const toChars = [...String(to)];
  if (fromChars.length !== 1 || toChars.length !== 1) {
    skipped += 1;
    continue;
  }
  if (fromChars[0] === toChars[0]) continue;
  filtered[fromChars[0]] = toChars[0];
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outJson, `${JSON.stringify(filtered, null, 2)}\n`);
writeFileSync(
  outMeta,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "new-village/joyo-kanji (kanji.json + variants.json)",
      license: "Apache-2.0",
      url: "https://github.com/new-village/joyo-kanji",
      entryCount: Object.keys(filtered).length,
      skippedNon1to1: skipped,
      extraPath: existsSync(extraPath) ? "data/kanji-compat-extra.json" : null
    },
    null,
    2
  )}\n`
);

console.log(
  `kanji-compat-map: ${Object.keys(filtered).length} entries → ${path.relative(root, outJson)}`
);
