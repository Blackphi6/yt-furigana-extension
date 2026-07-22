#!/usr/bin/env node
/**
 * Legal / trademark / attribution audit for release surfaces.
 * Fails CI when forbidden branding or missing disclaimers are detected.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const warnings = [];

function fail(msg) {
  failures.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "dist-store" || name === ".git")
      continue;
    if (name === ".cache") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function read(rel) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    fail(`missing required file: ${rel}`);
    return "";
  }
  return readFileSync(full, "utf8");
}

const FORBIDDEN_RE =
  /\bJRM\b|jrm-demo|ja\.2-38\.com|2-38\.com|zenn\.dev\/nixo|SecurData|説明文エディタ|同系統|JRM互換|JRM\+/i;

const ALLOWLIST = new Set([
  path.join(root, "scripts/audit-legal.mjs"),
  path.join(root, "docs/RELEASE-LEGAL-CHECKLIST.md"),
  path.join(root, "docs/TRADEMARK-AND-ATTRIBUTION.md")
]);

const TEXT_EXT = new Set([
  ".md",
  ".html",
  ".js",
  ".mjs",
  ".json",
  ".py",
  ".sh",
  ".yml",
  ".yaml",
  ".css",
  ".txt"
]);

// --- Forbidden strings repo-wide (except allowlist) ---
for (const file of walk(root)) {
  if (ALLOWLIST.has(file)) continue;
  if (file.includes(`${path.sep}.agents${path.sep}`)) continue;
  if (file.includes(`${path.sep}.cache${path.sep}`)) continue;
  if (!TEXT_EXT.has(path.extname(file))) continue;
  const text = readFileSync(file, "utf8");
  if (FORBIDDEN_RE.test(text)) {
    fail(`forbidden branding/reference: ${path.relative(root, file)}`);
  }
}

// --- Required attribution files ---
for (const rel of [
  "LICENSE",
  "NOTICE",
  "COPYING",
  "third_party/Apache-2.0.txt",
  "third_party/BSD-CMUdict.txt",
  "third_party/NOTICE-kuromoji.md",
  "licenses/licenses.html",
  "docs/TRADEMARK-AND-ATTRIBUTION.md"
]) {
  read(rel);
}

// --- manifest / popup ---
const manifest = read("manifest.json");
if (!/非公式/.test(manifest)) fail("manifest.json description must include 非公式");

const popup = read("popup/popup.html");
if (!/非公式/.test(popup)) fail("popup/popup.html must state 非公式");
if (!/商標/.test(popup)) fail("popup/popup.html must include trademark note");
if (!/製品名の略称/.test(popup)) fail("popup/popup.html must clarify YT naming");

// --- store listing ---
const listing = read("store/listing.md");
if (!/非公式/.test(listing)) fail("store/listing.md must include 非公式");
if (!/製品名の略称/.test(listing)) fail("store/listing.md must clarify YT naming");

// --- site pages ---
const siteDir = path.join(root, "site");
for (const file of readdirSync(siteDir)) {
  if (!file.endsWith(".html") || file.startsWith("partials")) continue;
  const rel = `site/${file}`;
  const html = read(rel);
  if (!/trademark-note/.test(html)) fail(`${rel} missing trademark-note footer`);
  if (!/製品名の略称/.test(html)) fail(`${rel} must clarify YT naming`);
}

// --- licenses in-extension ---
const licensesHtml = read("licenses/licenses.html");
if (!/公式アプリではありません/.test(licensesHtml)) {
  fail("licenses/licenses.html must state unofficial status");
}
if (!/TRADEMARK-AND-ATTRIBUTION/.test(licensesHtml)) {
  fail("licenses/licenses.html must link TRADEMARK-AND-ATTRIBUTION.md");
}

// --- pack include ---
const pack = read("scripts/pack-chrome-store.mjs");
for (const item of ["third_party", "NOTICE", "COPYING", "LICENSE", "licenses"]) {
  if (!pack.includes(`"${item}"`)) fail(`pack-chrome-store.mjs must include ${item}`);
}

// --- package.json public description ---
const pkg = JSON.parse(read("package.json"));
if (pkg.description && !/非公式|unofficial/i.test(pkg.description)) {
  warn("package.json description should mention unofficial status (npm metadata)");
}

// --- privacy: learning opt-out ---
const privacy = read("docs/PRIVACY.md");
if (!/オプトアウト/.test(privacy)) {
  fail("docs/PRIVACY.md must document learning log opt-out");
}
if (!/共有読みパック/.test(privacy)) {
  fail("docs/PRIVACY.md must document shared readings pack");
}
if (!/timedtext/.test(privacy)) {
  fail("docs/PRIVACY.md must clarify timedtext is not used on default path");
}
const privacySite = read("site/privacy.html");
if (!/オプトアウト/.test(privacySite)) {
  fail("site/privacy.html must document learning log opt-out");
}
if (!/共有読みパック/.test(privacySite)) {
  fail("site/privacy.html must document shared readings pack");
}
if (!/learningInboxEnabled/.test(popup)) {
  fail("popup/popup.html must expose learningInboxEnabled opt-out");
}
if (/インターネットに送りません/.test(popup)) {
  fail("popup must not claim zero network use (shared pack receives remotely)");
}
if (/ytfp_live_demo_key_001/.test(popup)) {
  fail("popup must not ship demo license key");
}
if (!/sharedPackEnabled/.test(popup)) {
  fail("popup must expose sharedPackEnabled opt-out");
}
const pricing = read("site/pricing.html");
if (/ytfp_live_demo_key_001/.test(pricing)) {
  fail("site/pricing.html must not publish demo license key");
}
if (!/返金/.test(pricing)) {
  fail("site/pricing.html must mention refund / support");
}
const defaults = read("src/default-settings.js");
if (!/learningInboxEnabled/.test(defaults)) {
  fail("src/default-settings.js must define learningInboxEnabled");
}
const learningInbox = read("src/learning-inbox.js");
if (!/isLearningInboxEnabled/.test(learningInbox)) {
  fail("src/learning-inbox.js must gate on isLearningInboxEnabled");
}

// --- manifest CSP / no bridge WAR ---
if (!/content_security_policy/.test(manifest)) {
  fail("manifest.json must declare content_security_policy.extension_pages");
}
if (/localhost:11434|127\.0\.0\.1:8765/.test(manifest) && !/optional_host_permissions[\s\S]*localhost:11434/.test(manifest)) {
  fail("localhost hosts must be optional_host_permissions, not required host_permissions");
}
const hostsBlock = manifest.match(/"host_permissions"\s*:\s*\[([\s\S]*?)\]/);
if (hostsBlock && /localhost|127\.0\.0\.1/.test(hostsBlock[1])) {
  fail("required host_permissions must not include localhost");
}

// --- shared pack always public ---
const contributions = read("src/contributions.js");
if (/normalizeReadingApiUrl/.test(contributions)) {
  fail("contributions.js must not route Free pack via readingApiUrl");
}

// --- seed for Docker ---
if (!existsSync(path.join(root, "data/generated/shared-readings-seed.json"))) {
  fail("data/generated/shared-readings-seed.json required for Free pack deploy");
}

// --- secrets must not ship in store pack ---
const includeBlock = pack.match(/const INCLUDE = \[([\s\S]*?)\];/);
const includeSrc = includeBlock ? includeBlock[1] : pack;
for (const bad of [".env", "reading-engine/.env", "store/.env.webstore", "licenses.json"]) {
  if (includeSrc.includes(`"${bad}"`) || includeSrc.includes(`'${bad}'`)) {
    fail(`pack-chrome-store.mjs INCLUDE must not list ${bad}`);
  }
}
if (!/FORBIDDEN_IN_ZIP|assertZipSafe/.test(pack)) {
  fail("pack-chrome-store.mjs must scan zip for secrets / bridge");
}

// --- meta samples: proper noun disclaimer ---
const neologdMeta = path.join(root, "data/generated/neologd-phrases.meta.json");
if (existsSync(neologdMeta)) {
  const meta = JSON.parse(readFileSync(neologdMeta, "utf8"));
  if (!meta.contentNotice) {
    warn("neologd-phrases.meta.json should include contentNotice (proper nouns)");
  }
}

if (warnings.length) {
  console.warn("Legal audit warnings:");
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
}

if (failures.length) {
  console.error("Legal audit FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("Legal / trademark audit passed.");
