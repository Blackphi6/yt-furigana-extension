# furigana-ruby-engine

日本語テキストにひらがなルビ（`<ruby>`）を付けるエンジンです。ブラウザ拡張「YT Furigana」「YT Live Chat Furigana」の読み付け部分を切り出したもので、**ブラウザ（拡張・Web ページ）と Node.js の両方で動きます**。`chrome.*` には依存しません。

- 形態素解析: kuromoji（IPADIC）
- 同梱の句辞書: 熟字訓・常用漢字の読み・人名・駅名・英語のカタカナ読み
- 文脈による読み分け（例: 「今日」「一日」「方」など）

YouTube・Google とは関係のない非公式プロジェクトです。

## インストール

```bash
npm install furigana-ruby-engine
```

辞書（約 20MB の gzip）をパッケージに同梱しています。

## 使い方

### Node.js

```js
import { createFuriganaEngine } from "furigana-ruby-engine";

const engine = await createFuriganaEngine();
engine.toHtml("今日は漢字の読みを練習する");
// → <ruby>今日<rt>きょう</rt></ruby>は<ruby>漢字<rt>かんじ</rt></ruby>の…
```

### 形態素解析器の差し替え

既定は同梱の kuromoji（IPADIC）です。`tokenize` に解析器を渡すと、それを使います（kuromoji の辞書は読み込みません）。
kuromoji 形式（`surface_form` と カタカナの `reading`）の形態素の配列を返す関数なら、Sudachi・MeCab など何でも使えます。

```js
const engine = await createFuriganaEngine({
  tokenize: (text) => mySudachi(text).map((m) => ({ surface_form: m.surface, reading: m.reading }))
});
```

複合語（行動力・日本橋・株式会社）は、長い単位で区切る解析器（Sudachi のモード C）のほうが正しく読めます。

### 読み API（任意）

`readingApi` を指定すると、`toHtmlAsync()` がサーバー側の読み推定 API を使い、手元の辞書（人名・駅名・熟字訓など）を重ねて返します。API が失敗・時間切れのときは手元のエンジンの結果を返します。

```js
const engine = await createFuriganaEngine({ readingApi: true });
await engine.toHtmlAsync("生麦生米を食べた");
// → <ruby>生麦<rt>なまむぎ</rt></ruby><ruby>生米<rt>なまごめ</rt></ruby>を…
```

#### 字幕など、すぐ表示したいとき

`prefetch()` で先に問い合わせておくと、表示するときは通信せずにすぐ返ります。`maxWaitMs` を付けると、間に合わない行は手元の結果ですぐ返し、API の結果は届きしだい次から使います。

```js
const engine = await createFuriganaEngine({ readingApi: true }); // 作成時にサーバーを起こす
engine.prefetch(captionLines);                                  // 字幕の全行を先読み
element.innerHTML = await engine.toHtmlAsync(line, { maxWaitMs: 150 });
```

- 一度取れた結果は行ごとに覚えます（最大 2000 行）。同じ行では通信しません
- 先読みは数行を 1 回にまとめて送ります（公開 API は 1 分あたりの回数に上限があります）

#### 注意

- **本文が API サーバーへ送られます。** 指定しなければ通信しません。利用者に送信を知らせてください
- `true` は公開 API（https://yt-furigana-readings.onrender.com）。無料枠のため、しばらく使わないと初回の応答に 30 秒ほどかかります。自前のサーバーは `{ url, apiKey, timeoutMs }` で指定します
- 公開 API はブラウザの任意の Web ページからは呼べません（CORS）。Node.js とブラウザ拡張から使えます
- 読み API が常に手元より正確とは限りません（例: 「明日」を「あす」、「大人気」を「おおにんき」と読むことがあります）

| option | 説明 |
|---|---|
| `url` | API のベース URL（`/v1/readings` は省略可） |
| `apiKey` | `Authorization: Bearer` に載せるキー |
| `timeoutMs` | 時間切れまでのミリ秒（既定 30000） |

### 読み候補

読みを選び直すメニューなどに使えます。`contextText` を渡すと、文脈に合う読みが上位に来ます。

```js
engine.candidates("一日", { contextText: "一日中ずっと" });
// → [{ reading: "いちにち", source: "context", label: "文脈" },
//    { reading: "ついたち", source: "dict", label: "辞書" }]
```

### ブラウザ（Web ページ）

`node_modules/furigana-ruby-engine/dict/` を静的ファイルとして配信し、その URL を渡します。

```js
import { createFuriganaEngine } from "furigana-ruby-engine";

const engine = await createFuriganaEngine({
  dictionaryBaseUrl: new URL("/assets/furigana-dict/", location.href)
});
element.innerHTML = engine.toHtml(text);
```

### ブラウザ拡張（Chrome / Firefox / Safari / Orion）

`dict/` を拡張に同梱し、`loadFile` で読み込みます。content script から読む場合は `manifest.json` の `web_accessible_resources` に辞書のパスを追加してください。

```js
const engine = await createFuriganaEngine({
  loadFile: async (name) => {
    const res = await fetch(chrome.runtime.getURL(`furigana-dict/${name}`));
    return res.arrayBuffer();
  }
});
```

WebKit 系（Safari / Orion）の content script で `fetch` が通らない場合は、background で読み込んでメッセージで渡す関数を `loadFile` にしてください。

## API

### `createFuriganaEngine(options?) → Promise<FuriganaEngine>`

| option | 説明 |
|---|---|
| `dictionaryBaseUrl` | `dict/` を配信している URL。ブラウザでは `loadFile` か、これが必須 |
| `loadFile(name)` | 辞書ファイル名 → gzip のバイト列（`ArrayBuffer` / `Uint8Array`）。読み込み方法を自分で決めたいとき |
| `phraseDictionaries` | 句辞書（熟字訓・人名・駅名など）を読むか。既定 `true` |
| `userReadings` | 表層 → 読み。例 `{ "髙橋": "たかはし" }` |
| `readingApi` | `toHtmlAsync` で読み API を使う。`true` で公開 API、または `{ url, apiKey, timeoutMs }`。既定は使わない |
| `tokenize` | 形態素解析器を差し替える。`(text) => 形態素の配列`。既定は同梱の kuromoji |
| `debug` | 辞書の読み込み完了・読み API の失敗をコンソールに出す。既定 `false` |

### `FuriganaEngine`

| メソッド | 説明 |
|---|---|
| `toHtml(text, { clickable?, contextText? })` | ルビ付き HTML（本文は HTML エスケープ済み）。`clickable: true` で語ごとの `<span class="yt-furigana-word">` 付き |
| `toHtmlAsync(text, { clickable?, contextText?, maxWaitMs? })` | `readingApi` 指定時は読み API + 手元の辞書。未指定・失敗・`maxWaitMs` 超過時は `toHtml` と同じ |
| `prefetch(texts)` | 先に読み API へ問い合わせて覚えておく。`readingApi` 未指定なら何もしない |
| `candidates(surface, { currentReading?, contextText? })` | 語の読み候補（スコア順・最大 8 件）。`{ reading, source, label }` の配列 |
| `tokenize(text)` | kuromoji の形態素（`surface_form` / `reading` など） |
| `hasKanji(text)` | 漢字を含むか |

## 注意

- 読み辞書・キャッシュはモジュール単位で共有します（1 ページに 1 エンジンを想定）
- 初回の辞書展開に数秒かかります（端末により 10 秒以上）

## ライセンス

ソースコードは MIT です。同梱辞書・解析器には別のライセンスがあります（kuromoji: Apache-2.0、IPADIC、人名・駅名データなど）。再配布するときは `COPYING`・`NOTICE`・`third_party/` も一緒に含めてください。
