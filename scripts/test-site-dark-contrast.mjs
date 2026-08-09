/**
 * Pages CSS のダークモード致命パターン監査。
 *
 * 禁止:
 * - color-mix(..., white) … ダークで淡ピンク背景＋明るい文字になりやすい
 * - 入力に color/background が無いローカル上書き（styles.css の共通ルールを打ち消す場合）
 *
 * 必須（styles.css）:
 * - --placeholder / --field-fg / --field-bg / --soft-accent-bg / --on-soft-accent
 * - input::placeholder ルール
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");

/** @param {string} dir */
function listCss(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "partials") continue;
      out.push(...listCss(p));
    } else if (name.name.endsWith(".css")) {
      out.push(p);
    }
  }
  return out;
}

const WHITE_MIX = /color-mix\s*\(\s*in\s+oklab\s*,[^)]*\bwhite\b/gi;
const stylesPath = path.join(siteDir, "styles.css");
const styles = readFileSync(stylesPath, "utf8");

for (const token of [
  "--placeholder",
  "--field-fg",
  "--field-bg",
  "--soft-accent-bg",
  "--on-soft-accent",
  "--track-bg"
]) {
  assert.ok(styles.includes(token), `styles.css must define ${token}`);
}

assert.ok(
  /html\[data-theme=["']dark["']\][\s\S]*--placeholder\s*:/.test(styles),
  "dark theme must set --placeholder"
);
assert.ok(
  /input::placeholder[\s\S]*textarea::placeholder/.test(styles) ||
    /input::placeholder,\s*textarea::placeholder/.test(styles),
  "styles.css must style ::placeholder"
);

/** @type {string[]} */
const violations = [];
for (const file of listCss(siteDir)) {
  // streamyard-overlay は独自ダークUI（サイトテーマ外）
  if (file.endsWith("streamyard-overlay.css")) continue;
  const text = readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  let m;
  WHITE_MIX.lastIndex = 0;
  while ((m = WHITE_MIX.exec(text))) {
    const line = text.slice(0, m.index).split("\n").length;
    violations.push(`${rel}:${line}: color-mix(... white) — use --elevated / --soft-accent-bg`);
  }
}

assert.equal(
  violations.length,
  0,
  `dark-mode contrast hazards:\n${violations.join("\n")}`
);

// 相対輝度ざっくり（#rrggbb）— プレースホルダ vs field-bg
function parseHex(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relLum({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const L1 = relLum(parseHex(a));
  const L2 = relLum(parseHex(b));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const darkPlaceholder = styles.match(/html\[data-theme="dark"\][\s\S]*?--placeholder:\s*(#[0-9a-fA-F]{3,8})/);
const darkFieldBg = styles.match(/html\[data-theme="dark"\][\s\S]*?--field-bg:\s*(#[0-9a-fA-F]{3,8})/);
assert.ok(darkPlaceholder && darkFieldBg, "dark --placeholder and --field-bg must be hex for audit");
const ratio = contrast(darkPlaceholder[1], darkFieldBg[1]);
assert.ok(
  ratio >= 3,
  `dark placeholder contrast ${ratio.toFixed(2)} < 3 (got ${darkPlaceholder[1]} on ${darkFieldBg[1]})`
);

console.log("test-site-dark-contrast: ok");
