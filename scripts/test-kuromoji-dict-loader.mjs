// iPad Orion 向け多経路 kuromoji 辞書ローダー: fetch/XHR が死んでも background 中継で辞書が組める
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dictDir = new URL("../extensions/yt-superchat-furigana/dict/", import.meta.url);
const EXT_BASE = "safari-web-extension://ABC/";

// content script から拡張 URL を読めない状況を再現
globalThis.fetch = async () => {
  throw new TypeError("Load failed");
};
globalThis.XMLHttpRequest = undefined;
// Orion の隔離世界: ネイティブ gzip 展開が型エラーで落ちる → zlibjs に戻す
globalThis.DecompressionStream = class {
  constructor() {
    throw new TypeError("Invalid type should be ArrayBuffer");
  }
};

let bgCalls = 0;
globalThis.chrome = {
  runtime: {
    lastError: undefined,
    sendMessage(msg, cb) {
      bgCalls += 1;
      assert.equal(msg.type, "YTSCF_DICT_FILE");
      assert.match(msg.path, /^dict\/[A-Za-z0-9_]+\.dat\.gz$/);
      readFile(new URL(msg.path.replace(/^dict\//, ""), dictDir)).then((buf) =>
        cb({ ok: true, b64: buf.toString("base64") })
      );
    }
  }
};

const Loader = require("../extensions/yt-superchat-furigana/src/kuromoji-dict-loader.cjs");
const Tokenizer = require("kuromoji/src/Tokenizer.js");

const dic = await new Promise((resolve, reject) => {
  new Loader(`${EXT_BASE}dict/`).load((err, d) => (err ? reject(err) : resolve(d)));
});
const tokens = new Tokenizer(dic).tokenize("漢字の読み");
assert.equal(tokens[0].surface_form, "漢字");
assert.equal(tokens[0].reading, "カンジ");

const log = Loader.getDictLoadLog();
assert.equal(log.via, "bg", "background 中継で読めた");
assert.ok(log.errors.some((e) => e.startsWith("fetch: Load failed")), "fetch の失敗理由を記録");
assert.ok(log.errors.some((e) => e.startsWith("xhr:")), "XHR の失敗理由を記録");
assert.equal(bgCalls, 12, "12 ファイルすべて中継");

console.log("test-kuromoji-dict-loader: ok");
