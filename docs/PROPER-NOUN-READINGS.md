# 人名・異体字の読み運用

最終更新: 2026-08-01

字幕の固有名詞は IME 級でも漏れうる（例: 経沢、髙橋）。網羅辞書の追従は本拡張の本業ではない。

## レイヤ（優先順）

1. **クリック登録（user_dict）** — 長尾の本命。未設定漢字はクリックで登録。
2. **`data/personal-name-extra.json`** — 繰り返し漏れる姓を手で足し、`npm run dict:personal-names`。
3. **バンドル人名フレーズ** — 工藤 Mozc 人名（姓+名）+ MIT 上位姓 + 沖縄辞書 name.dic + extra。
4. **異体字・旧字の照合正規化** — joyokanji 由来マップで `髙→高` 等。**表示は原文のまま**、Kuromoji / フレーズ照合キーだけ常用形へ寄せる（`src/kanji-normalize.js`）。
5. **JMnedict 等の巨大人名 DB** — ShareAlike のため採用しない。
6. **地名** — `npm run dict:place-names`（Geolonia / ABR / 地名集日本 / GeoNLP / KEN_ALL / 沖縄辞書 o-dic）。詳細は [`PLACE-NAME-DATASETS.md`](PLACE-NAME-DATASETS.md)。
7. **駅** — `npm run dict:stations`（NEologd `*駅`。地名の後で勝つ）。

## 異体字（髙橋問題）

- `hasKanji("髙橋")` は true。Kuromoji は `髙` を UNKNOWN にし読みが付かない。
- NFKC でも `髙`→`高` にならない。
- 対策: 照合前に `normalizeKanjiForLookup`（joyokanji Apache-2.0 + `data/kanji-compat-extra.json`）。
- 再生成: `npm run dict:kanji-compat`

## やらないこと

- LLM で人名を大量生成して辞書に載せる
- ネイティブ字幕を隠してオーバーレイ必須にする
- timedtext 連打（`.cursor/rules/youtube-timedtext-429.mdc`）
