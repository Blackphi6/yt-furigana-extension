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

// 解析器の差し替え: tokenize を渡すと kuromoji を読み込まずにそれを使う（Sudachi などを外から渡せる）
{
  let loadedKuromoji = false;
  let called = 0;
  const custom = await createFuriganaEngine({
    loadFile: async (name) => {
      if (name.endsWith(".dat.gz")) loadedKuromoji = true;
      return readFile(new URL(`../dict/${name}`, import.meta.url));
    },
    phraseDictionaries: false,
    tokenize: (text) => {
      called += 1;
      return engine.tokenize(text).map((t) => (t.surface_form === "行動" ? { ...t, reading: "コウドウ" } : t));
    }
  });
  assert.match(custom.toHtml("行動する"), /<rt>こうどう<\/rt>/);
  assert.ok(called > 0, "渡した解析器を使うこと");
  assert.equal(loadedKuromoji, false, "解析器を渡したら kuromoji の辞書を読まないこと");
  await assert.rejects(() => createFuriganaEngine({ tokenize: "kuromoji" }), /tokenize/);
}
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
  let posts = 0;
  let healthHits = 0;
  let fail = false;
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      healthHits += 1;
      res.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      posts += 1;
      lastRequest = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      if (fail) {
        res.writeHead(500).end("boom");
        return;
      }
      // 本物と同じく、まとめて送られた全文に対する位置（span）で返す
      const text = lastRequest.body.text;
      const tokens = [];
      for (let i = text.indexOf("生米"); i >= 0; i = text.indexOf("生米", i + 2)) {
        tokens.push({ surface: "生米", span: [i, i + 2], reading: "なまごめ", source: "base_engine" });
      }
      setTimeout(
        () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tokens })),
        text.includes("遅延") ? 300 : 0
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
    for (let i = 0; i < 100 && healthHits === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(healthHits, 1, "作成時にサーバーを起こしておくこと");

    assert.match(await remote.toHtmlAsync("生米"), /<rt>なまごめ<\/rt>/, "API の読みを使うこと");
    assert.equal(lastRequest.url, "/v1/readings");
    assert.equal(lastRequest.auth, "Bearer test-key");
    assert.equal(lastRequest.body.text, "生米");
    assert.deepEqual(lastRequest.body.user_dict, [{ surface: "髙橋", reading: "たかはし" }]);

    // 一度取れた結果は保存され、同じ文では通信しない
    posts = 0;
    assert.match(await remote.toHtmlAsync("生米"), /<rt>なまごめ<\/rt>/);
    assert.equal(posts, 0, "保存済みの結果を使うこと");

    // 先読み: 複数行を 1 回にまとめ、行ごとに結果を保存する
    posts = 0;
    await remote.prefetch(["生米と麦", "漢字です", "麦と生米", "漢字です"]);
    assert.equal(posts, 1, "先読みは 1 回の通信にまとめること");
    assert.match(lastRequest.body.text, /生米と麦\n漢字です\n麦と生米/, "重複を除いて改行でつなぐこと");
    const second = await remote.toHtmlAsync("麦と生米");
    assert.match(second, /^麦と<ruby>生米<rt>なまごめ<\/rt><\/ruby>$/, "2 行目以降も位置がずれないこと");
    assert.match(await remote.toHtmlAsync("漢字です"), /<rt>かんじ<\/rt>/, "API が読みを返さない行は手元で");
    assert.equal(posts, 1, "先読みした行は通信しないこと");

    // 待ち時間の上限: 間に合わなければ手元の結果を返し、API の結果は後で使う
    posts = 0;
    const started = Date.now();
    const quick = await remote.toHtmlAsync("遅延する生米", { maxWaitMs: 20 });
    assert.ok(Date.now() - started < 200, "上限を過ぎたらすぐ返すこと");
    assert.doesNotMatch(quick, /なまごめ/, "間に合わないときは手元の結果");
    await new Promise((r) => setTimeout(r, 400));
    assert.match(await remote.toHtmlAsync("遅延する生米"), /<rt>なまごめ<\/rt>/, "遅れて届いた結果を使うこと");
    assert.equal(posts, 1, "遅れて届いた結果も保存すること");

    fail = true;
    assert.match(
      await remote.toHtmlAsync("漢字"),
      /<rt>かんじ<\/rt>/,
      "API が失敗したら手元のエンジンで返すこと"
    );
    await remote.prefetch(["失敗する漢字"]);
    fail = false;
    posts = 0;
    await remote.toHtmlAsync("失敗する漢字");
    assert.equal(posts, 1, "失敗した結果は保存しないこと");

    // 指定しなければ API には送らない（プライバシー）
    lastRequest = null;
    healthHits = 0;
    assert.match(await engine.toHtmlAsync("漢字"), /<rt>かんじ<\/rt>/);
    await engine.prefetch(["生米"]);
    assert.equal(lastRequest, null, "readingApi 未指定では通信しないこと");
    assert.equal(healthHits, 0);
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
