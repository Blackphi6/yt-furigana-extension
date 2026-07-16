# オープンソースライセンス / Open Source Licenses

この拡張機能と関連ツールは、自作コードに加え複数のオープンソース成果物を利用しています。

本プロジェクト

| 項目 | 内容 |
|------|------|
| 名称 | YT Furigana |
| ライセンス | [MIT License](../LICENSE) |
| 著作権 | Copyright (c) 2026 Blackphi6 and YT Furigana contributors |
| 出典一覧（NEologd と同様の表記） | [COPYING](../COPYING) |
| リポジトリ | https://github.com/Blackphi6/yt-furigana-extension |

**まず読むファイル:** [`COPYING`](../COPYING)（利用データ・ライブラリの出典と感謝、無保証）


## 拡張機能に同梱・利用する主な第三者成果物

| 成果物 | ライセンス | 用途 | 詳細 |
|--------|------------|------|------|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) | Apache-2.0 | 形態素解析（既定） | [NOTICE](../NOTICE) / [Apache-2.0](../third_party/Apache-2.0.txt) |
| mecab-ipadic（kuromoji 経由） | NAIST / ICOT 条件付き | 日本語辞書データ | [NOTICE-kuromoji.md](../third_party/NOTICE-kuromoji.md) |
| [mecab-ipadic-NEologd](https://github.com/neologd/mecab-ipadic-neologd) | Apache-2.0 | 固有名詞フレーズ（抽出・圧縮同梱） | [NOTICE](../NOTICE) / 上流 COPYING |
| [sudachi-wasm333](https://github.com/Benjas333/sudachi-wasm333) | Apache-2.0 | Sudachi 解析 | [NOTICE](../NOTICE) |
| SudachiDict | Apache-2.0（上流） | Sudachi 辞書 | 上流プロジェクトの NOTICE を参照 |
| [BudouX](https://github.com/google/budoux) | Apache-2.0 | 字幕の自然な折り返し（句境界） | [NOTICE](../NOTICE) |
| [CMUdict](https://github.com/cmusphinx/cmudict) | BSD-2-Clause | 英単語→カタカナ読み（事前変換データ） | [BSD-CMUdict.txt](../third_party/BSD-CMUdict.txt) |

**IPADIC:** 奈良先端科学技術大学院大学（NAIST）の著作物を含み、ICOT Free Software 由来のエントリもあります。再配布時は著作権表示と無保証条項の添付が必要です（全文は `third_party/NOTICE-kuromoji.md`）。

## 任意のローカル読みエンジン（reading-engine）

拡張本体とは別に、開発者がローカル起動する API です。

| 成果物 | ライセンス |
|--------|------------|
| fugashi | MIT AND BSD-3-Clause |
| unidic-lite / UniDic 由来データ | 上流（NINJAL 等）の条件に従う |
| FastAPI | MIT |
| Uvicorn | BSD-3-Clause |
| Pydantic | MIT |

## 利用者向けの注意（権利）

- 本拡張は、ブラウザ上で表示中の字幕にルビを重ねるクライアント側の表示加工です。
- YouTube / TVer など各サービスの利用規約は別途ご確認ください。
- YouTube、TVer、Google Chrome 等は各社の商標です。本拡張は公式製品ではありません。
- 字幕・歌詞テキスト自体の著作権は、各権利者に帰属します。本プロジェクトはそれらコンテンツの再配布を目的としません。
- ユーザーが登録した読みは端末内（Free）またはユーザーが接続した同期サーバー（Premium）に保存されます。

## ファイル一覧

- [`LICENSE`](../LICENSE) — 本プロジェクト（MIT）
- [`NOTICE`](../NOTICE) — 第三者帰属の要約
- [`third_party/Apache-2.0.txt`](../third_party/Apache-2.0.txt)
- [`third_party/BSD-CMUdict.txt`](../third_party/BSD-CMUdict.txt)
- [`third_party/NOTICE-kuromoji.md`](../third_party/NOTICE-kuromoji.md)
- [`licenses/licenses.html`](../licenses/licenses.html) — 拡張内表示用
- [`docs/TRADEMARK-AND-ATTRIBUTION.md`](TRADEMARK-AND-ATTRIBUTION.md) — 商標・帰属
