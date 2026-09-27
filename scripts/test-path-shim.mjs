// kuromoji 辞書 URL 用 path.join シムの回帰テスト（Orion/Safari の拡張スキーム）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const mod = { exports: {} };
vm.runInNewContext(readFileSync(new URL("./shims/path.js", import.meta.url), "utf8"), {
  module: mod
});
const { join } = mod.exports;

for (const base of [
  "chrome-extension://abc/dict/",
  "safari-web-extension://ABC-123/dict/",
  "moz-extension://uuid/dict"
]) {
  const url = new URL(join(base, "base.dat.gz"));
  assert.notEqual(url.host, "", `${base} の host が消えている`);
  assert.ok(url.pathname.endsWith("/dict/base.dat.gz"));
}
assert.equal(join("https://x.test//a/", "/b.gz"), "https://x.test/a/b.gz");
assert.equal(join("dict/", "base.dat.gz"), "dict/base.dat.gz");

console.log("test-path-shim: ok");
