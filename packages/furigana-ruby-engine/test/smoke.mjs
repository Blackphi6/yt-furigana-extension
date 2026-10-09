// ビルド済み dist を Node から使えるか（chrome.* 無し・同梱辞書・独自ローダー）
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFuriganaEngine } from "../dist/index.js";

assert.equal(typeof globalThis.chrome, "undefined", "拡張 API 無しで動くこと");

// 1) 既定: パッケージ同梱の dict/ を fs で読む
const engine = await createFuriganaEngine();
const html = engine.toHtml("今日は漢字の読みを練習する");
assert.match(html, /<ruby>今日<rt>きょう<\/rt><\/ruby>/);
assert.match(html, /<ruby>漢字<rt>かんじ<\/rt><\/ruby>/);
assert.doesNotMatch(html, /yt-furigana-word/, "既定は素の <ruby>");
assert.match(engine.toHtml("漢字", { clickable: true }), /class="yt-furigana-word"/);

// 2) HTML エスケープ
const escaped = engine.toHtml('<script>alert("x")</script>漢字');
assert.doesNotMatch(escaped, /<script>/);

// 3) 形態素
assert.equal(engine.tokenize("漢字")[0].surface_form, "漢字");
assert.equal(engine.hasKanji("ひらがな"), false);

// 4) 独自ローダー（拡張なら chrome.runtime.getURL で読む想定）+ ユーザー読み
const requested = [];
const custom = await createFuriganaEngine({
  loadFile: async (name) => {
    requested.push(name);
    return readFile(new URL(`../dict/${name}`, import.meta.url));
  },
  phraseDictionaries: false,
  userReadings: { 髙橋: "たかはし" }
});
assert.ok(requested.includes("base.dat.gz"));
assert.match(custom.toHtml("髙橋さん"), /<rt>たかはし<\/rt>/);

// 5) ブラウザで URL 未指定は分かるエラー
const saved = globalThis.process;
globalThis.process = undefined;
await assert.rejects(() => createFuriganaEngine(), /dictionaryBaseUrl/);
globalThis.process = saved;

console.log("furigana-ruby-engine smoke: ok");
