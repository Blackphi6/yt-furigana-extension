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

// 3.5) 読み候補（拡張の読み選択メニューと同じ）
const kata = engine.candidates("方").map((c) => c.reading);
assert.ok(kata.includes("ほう") && kata.includes("かた"), "同形異音の候補が出ること");
const withCurrent = engine.candidates("方", { currentReading: "かた" });
assert.deepEqual(withCurrent[0], { reading: "かた", source: "current", label: "現在" });
for (const c of withCurrent) {
  assert.equal(typeof c.reading, "string");
  assert.equal(typeof c.source, "string");
  assert.equal(typeof c.label, "string");
}
assert.deepEqual(engine.candidates(""), []);

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
assert.ok(
  custom.candidates("髙橋").some((c) => c.reading === "たかはし" && c.source === "user"),
  "userReadings が候補にも出ること"
);

// 4.5) 読み API（ネットワークに出ないよう手元のモックサーバーで確認）
{
  const { createServer } = await import("node:http");
  let lastRequest = null;
  let fail = false;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastRequest = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      if (fail) {
        res.writeHead(500).end("boom");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          tokens: [{ surface: "生米", span: [0, 2], reading: "なまごめ", source: "base_engine" }]
        })
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const remote = await createFuriganaEngine({
      readingApi: { url, apiKey: "test-key" },
      userReadings: { 髙橋: "たかはし" }
    });
    assert.match(await remote.toHtmlAsync("生米"), /<rt>なまごめ<\/rt>/, "API の読みを使うこと");
    assert.equal(lastRequest.url, "/v1/readings");
    assert.equal(lastRequest.auth, "Bearer test-key");
    assert.equal(lastRequest.body.text, "生米");
    assert.deepEqual(lastRequest.body.user_dict, [{ surface: "髙橋", reading: "たかはし" }]);

    fail = true;
    assert.match(
      await remote.toHtmlAsync("漢字"),
      /<rt>かんじ<\/rt>/,
      "API が失敗したら手元のエンジンで返すこと"
    );

    // 指定しなければ API には送らない（プライバシー）
    lastRequest = null;
    assert.match(await engine.toHtmlAsync("漢字"), /<rt>かんじ<\/rt>/);
    assert.equal(lastRequest, null, "readingApi 未指定では通信しないこと");
  } finally {
    server.close();
  }
}

// 5) ブラウザで URL 未指定は分かるエラー
const saved = globalThis.process;
globalThis.process = undefined;
await assert.rejects(() => createFuriganaEngine(), /dictionaryBaseUrl/);
globalThis.process = saved;

console.log("furigana-ruby-engine smoke: ok");
