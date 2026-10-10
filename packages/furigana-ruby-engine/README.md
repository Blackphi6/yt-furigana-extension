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
| `debug` | 辞書の読み込み完了をコンソールに出す。既定 `false` |

### `FuriganaEngine`

| メソッド | 説明 |
|---|---|
| `toHtml(text, { clickable?, contextText? })` | ルビ付き HTML（本文は HTML エスケープ済み）。`clickable: true` で語ごとの `<span class="yt-furigana-word">` 付き |
| `candidates(surface, { currentReading?, contextText? })` | 語の読み候補（スコア順・最大 8 件）。`{ reading, source, label }` の配列 |
| `tokenize(text)` | kuromoji の形態素（`surface_form` / `reading` など） |
| `hasKanji(text)` | 漢字を含むか |

## 注意

- 読み辞書・キャッシュはモジュール単位で共有します（1 ページに 1 エンジンを想定）
- 初回の辞書展開に数秒かかります（端末により 10 秒以上）

## ライセンス

ソースコードは MIT です。同梱辞書・解析器には別のライセンスがあります（kuromoji: Apache-2.0、IPADIC、人名・駅名データなど）。再配布するときは `COPYING`・`NOTICE`・`third_party/` も一緒に含めてください。
