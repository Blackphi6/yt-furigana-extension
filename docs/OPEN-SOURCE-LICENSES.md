# オープンソースライセンス / Open Source Licenses

この拡張機能と関連ツールは、自作コードに加え複数のオープンソース成果物を利用しています。

## 本プロジェクト

| 項目 | 内容 |
|------|------|
| 名称 | YT Furigana |
| ライセンス | [MIT License](../LICENSE) |
| 著作権 | Copyright (c) 2026 Blackphi6 and YT Furigana contributors |
| リポジトリ | https://github.com/Blackphi6/yt-furigana-extension |

## 拡張機能に同梱・利用する主な第三者成果物

| 成果物 | ライセンス | 用途 | 詳細 |
|--------|------------|------|------|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) | Apache-2.0 | 形態素解析（既定） | [NOTICE](../NOTICE) / [Apache-2.0](../third_party/Apache-2.0.txt) |
| mecab-ipadic（kuromoji 経由） | NAIST / ICOT 条件付き | 日本語辞書データ | [NOTICE-kuromoji.md](../third_party/NOTICE-kuromoji.md) |
| [sudachi-wasm333](https://github.com/Benjas333/sudachi-wasm333) | Apache-2.0 | Sudachi 解析 | [NOTICE](../NOTICE) |
| SudachiDict | Apache-2.0（上流） | Sudachi 辞書 | 上流プロジェクトの NOTICE を参照 |

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
- 字幕・歌詞テキスト自体の著作権は、各権利者に帰属します。本プロジェクトはそれらコンテンツの再配布を目的としません。
- ユーザーが登録した読みは端末内（Free）またはユーザーが接続した同期サーバー（Premium）に保存されます。

## ファイル一覧

- [`LICENSE`](../LICENSE) — 本プロジェクト（MIT）
- [`NOTICE`](../NOTICE) — 第三者帰属の要約
- [`third_party/Apache-2.0.txt`](../third_party/Apache-2.0.txt)
- [`third_party/NOTICE-kuromoji.md`](../third_party/NOTICE-kuromoji.md)
- [`licenses/licenses.html`](../licenses/licenses.html) — 拡張内表示用
