#!/usr/bin/env node
/**
 * Assemble store/cws-upload/ for Chrome Web Store Developer Dashboard.
 * Run after `npm run pack:store`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "store", "cws-upload");
const zipSrc = path.join(root, "dist-store", "yt-furigana-extension.zip");
const shots = path.join(root, "store", "screenshots");

if (!existsSync(zipSrc)) {
  console.error("Missing dist-store zip. Run: npm run pack:store");
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const shotOut = path.join(out, "screenshots");
mkdirSync(shotOut, { recursive: true });

cpSync(zipSrc, path.join(out, "yt-furigana-extension.zip"));
cpSync(path.join(root, "icons", "icon128.png"), path.join(out, "icon128.png"));

for (const name of [
  "01-hero-1280x800.png",
  "02-caption-1280x800.png",
  "03-popup-1280x800.png",
  "04-picker-1280x800.png",
  "promo-440x280.png",
  "promo-1400x560.png"
]) {
  const src = path.join(shots, name);
  if (!existsSync(src)) {
    console.error("Missing screenshot:", name);
    process.exit(1);
  }
  if (name.startsWith("promo-")) {
    cpSync(src, path.join(out, name));
  } else {
    cpSync(src, path.join(shotOut, name));
  }
}

const version = JSON.parse(
  readFileSync(path.join(root, "manifest.json"), "utf8")
).version;

writeFileSync(
  path.join(out, "CHECKLIST.txt"),
  `# 提出直前チェック

- version: ${version}
- zip: yt-furigana-extension.zip
- screenshots: 4 × 1280×800
- promo: 440×280, 1400×560
- paste: PASTE.txt
- privacy: https://blackphi6.github.io/yt-furigana-extension/privacy.html
- support: https://github.com/Blackphi6/yt-furigana-extension/issues

Generated: ${new Date().toISOString()}
`,
  "utf8"
);

console.log(`CWS upload kit → ${out}`);
console.log("Open store/cws-upload/README.md and PASTE.txt to submit.");
