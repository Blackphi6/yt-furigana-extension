// Netflix 対応の配線チェック（manifest のホスト許可漏れ・セレクタ取り違えの回帰防止）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const manifest = JSON.parse(read("manifest.json"));
const NETFLIX_HOST = "*://www.netflix.com/*";

assert.ok(
  manifest.host_permissions.includes(NETFLIX_HOST),
  "manifest.json: host_permissions に Netflix が無い"
);
assert.ok(
  manifest.content_scripts[0].matches.includes(NETFLIX_HOST),
  "manifest.json: content_scripts.matches に Netflix が無い"
);
assert.ok(
  manifest.web_accessible_resources[0].matches.includes(NETFLIX_HOST),
  "manifest.json: web_accessible_resources.matches に Netflix が無い（辞書ファイルが読めない）"
);

const content = read("src/content.js");
assert.ok(
  content.includes('".player-timedtext-text-container"'),
  "content.js: NETFLIX_CAPTION_LINE_SELECTOR が無い"
);
assert.ok(content.includes("function isNetflixHost"), "content.js: isNetflixHost が無い");
assert.ok(
  /CAPTION_SELECTORS = \[[\s\S]*?NETFLIX_CAPTION_SELECTORS/.test(content),
  "content.js: CAPTION_SELECTORS に Netflix セレクタが合流していない"
);

const rubyLayout = read("src/ruby-layout.js");
assert.ok(
  rubyLayout.includes(".player-timedtext-text-container"),
  "ruby-layout.js: Netflix の字幕コンテナ判定が無い"
);

const css = read("styles/content.css");
assert.ok(
  css.includes(".player-timedtext-text-container[data-yt-furigana-styled] rt"),
  "content.css: Netflix 用のルビ配置スタイルが無い"
);

console.log("test-netflix-support: ok");
