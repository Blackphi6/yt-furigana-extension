#!/usr/bin/env node
/**
 * pack:store / pack:superchat 後に GitHub Release を作成・更新する。
 * SKIP_GITHUB_RELEASE=1 でスキップ。
 *
 * Usage:
 *   node scripts/github-release.mjs --product furigana
 *   node scripts/github-release.mjs --product live-chat
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PRODUCTS = {
  furigana: {
    label: "YT Furigana",
    tagPrefix: "v",
    manifest: path.join(root, "manifest.json"),
    zip: path.join(root, "dist-store", "yt-furigana-extension.zip"),
    assetName: "yt-furigana-extension.zip",
    latest: true
  },
  "live-chat": {
    label: "YT Live Chat Furigana",
    tagPrefix: "live-chat-v",
    manifest: path.join(root, "extensions", "yt-superchat-furigana", "manifest.json"),
    zip: path.join(root, "dist-store-superchat", "yt-superchat-furigana.zip"),
    assetName: "yt-superchat-furigana.zip",
    latest: false
  }
};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    ...opts
  });
}

function parseArgs(argv) {
  const out = { product: null, notes: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--product") out.product = argv[++i];
    else if (a === "--notes") out.notes = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function defaultNotes(productKey, version) {
  if (productKey === "live-chat") {
    return [
      `## Summary`,
      `- YT Live Chat Furigana ${version}`,
      `- ルビ上の範囲選択（ドラッグ）で複数語をまとめて読み指定`,
      ``,
      `## Chrome Web Store`,
      `- zip: 本リリース添付の \`yt-superchat-furigana.zip\``,
      `- 説明文: \`store/superchat/listing.md\``,
      `- 提出は Developer Dashboard で手動`
    ].join("\n");
  }
  return [
    `## Summary`,
    `- YT Furigana ${version}`,
    `- ルビ上の範囲選択（ドラッグ）で複数語をまとめて読み指定`,
    `- 出現位置ベースの読みオーバーライド（occurrenceReadingOverrides）`,
    ``,
    `## Chrome Web Store`,
    `- zip: 本リリース添付の \`yt-furigana-extension.zip\``,
    `- 説明文: \`store/listing.md\``,
    `- 提出は Developer Dashboard で手動`
  ].join("\n");
}

function ensureRemoteHead() {
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.status !== 0) {
    throw new Error("git rev-parse failed");
  }
  const name = String(branch.stdout || "").trim();
  if (!name || name === "HEAD") {
    console.warn("Detached HEAD — tag will point at current commit");
    return;
  }
  const status = run("git", ["status", "-sb"]);
  const sb = String(status.stdout || "");
  if (sb.includes("[ahead ")) {
    console.log(`Pushing ${name} before GitHub Release…`);
    const push = run("git", ["push", "-u", "origin", "HEAD"], { stdio: "inherit" });
    if (push.status !== 0) {
      throw new Error("git push failed — cannot create release from unpushed commits");
    }
  }
}

function releaseExists(tag) {
  const view = run("gh", ["release", "view", tag]);
  return view.status === 0;
}

function publish(productKey, notesOverride) {
  if (process.env.SKIP_GITHUB_RELEASE === "1") {
    console.log("SKIP_GITHUB_RELEASE=1 — skipping GitHub Release");
    return;
  }

  const product = PRODUCTS[productKey];
  if (!product) {
    throw new Error(`Unknown product: ${productKey} (furigana|live-chat)`);
  }

  const gh = run("gh", ["auth", "status"]);
  if (gh.status !== 0) {
    console.warn("gh auth なし — GitHub Release をスキップします");
    return;
  }

  if (!existsSync(product.zip)) {
    throw new Error(`Missing zip: ${product.zip} (pack を先に実行)`);
  }

  const version = JSON.parse(readFileSync(product.manifest, "utf8")).version;
  const tag = `${product.tagPrefix}${version}`;
  const title = `${product.label} v${version}`;
  const notes = notesOverride || defaultNotes(productKey, version);

  ensureRemoteHead();

  if (releaseExists(tag)) {
    console.log(`Updating assets on existing release ${tag}…`);
    const upload = run(
      "gh",
      ["release", "upload", tag, `${product.zip}#${product.assetName}`, "--clobber"],
      { stdio: "inherit" }
    );
    if (upload.status !== 0) {
      throw new Error(`gh release upload failed for ${tag}`);
    }
    // ノートも現行に寄せる
    run("gh", ["release", "edit", tag, "--title", title, "--notes", notes], {
      stdio: "inherit"
    });
  } else {
    console.log(`Creating GitHub Release ${tag}…`);
    const args = [
      "release",
      "create",
      tag,
      `${product.zip}#${product.assetName}`,
      "--title",
      title,
      "--notes",
      notes
    ];
    if (!product.latest) args.push("--latest=false");
    const create = run("gh", args, { stdio: "inherit" });
    if (create.status !== 0) {
      throw new Error(`gh release create failed for ${tag}`);
    }
  }

  const url = run("gh", ["release", "view", tag, "--json", "url", "-q", ".url"]);
  if (url.status === 0) {
    console.log(`GitHub Release → ${String(url.stdout || "").trim()}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.product) {
    console.log(`Usage: node scripts/github-release.mjs --product furigana|live-chat [--notes "..."]`);
    process.exit(args.help ? 0 : 1);
  }
  try {
    publish(args.product, args.notes);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
