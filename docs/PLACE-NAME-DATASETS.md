# 地名・駅データセット（商用利用可能な読み付き）

最終更新: 2026-08-10

字幕ルビ用に、**漢字表層 → ひらがな読み**だけを抽出して同梱する。

## ビルド

```bash
npm run dict:place-names
npm run dict:stations
npm run build
```

出力:

- `data/generated/place-name-phrases.json.gz` → `dict/place-name-phrases.json.gz`
- `data/generated/station-phrases.json.gz` → `dict/station-phrases.json.gz`

Pages デモ用:

- `place-name-phrases-site.json`（都道府県・市区町村・区・地名集・GeoNLP の pref/POI。町丁目全文は載せない）→ `site/place-name-phrases.json`
- `station-phrases-site.json`（*駅 + 駅なし表層）→ `site/station-phrases.json`

## 取り込み済み（地名）

| ソース | ライセンス | 内容 |
|--------|------------|------|
| [Geolonia japanese-addresses](https://github.com/geolonia/japanese-addresses) | CC BY 4.0 | 都道府県・市区町村・町丁目＋カナ |
| [デジタル庁 ABR](https://www.digital.go.jp/policies/base_registry_address) | PDL1.0（商用可・出典必須） | 町字マスタ等＋カナ |
| [国土地理院 地名集日本](https://www.gsi.go.jp/kihonjohochousa/gazetteer.html) | PDL1.0（出典必須） | 標準地名〜約3900（かな付き）。機械可読は LinkData |
| [GeoNLP](https://geonlp.ex.nii.ac.jp/dictionary/)（読み付きのみ） | CC BY 4.0 | 都道府県 / 歴史地名大系 地名・POI |
| [日本郵便 KEN_ALL](https://www.post.japanpost.jp/zipcode/dl/utf-zip.html) | 郵便番号データ利用許諾（商用可） | **既存に無い町域のみ**ギャップ埋め（ビル名・○階等は除外） |

優先（地名ビルド）: Geolonia → ABR で上書き拡充 → 地名集 → GeoNLP → KEN_ALL（ギャップのみ）。

## 取り込み済み（駅）

| ソース | ライセンス | 内容 |
|--------|------------|------|
| [mecab-ipadic-NEologd](https://github.com/neologd/mecab-ipadic-neologd) 種子の `*駅` | Apache-2.0 | `放出駅`→`はなてんえき`、`放出`→`はなてん` |

実行時 Trie: NEologd < UniDic < 地名 < **駅** < 人名。  
駅を地名の後にする理由: KEN_ALL の「十三」→じゅうさん を駅読み「じゅうそう」で上書きするため。

## 同梱しない

- **電子国土基本図（地名情報）** — 読み付きだが測量成果。複製・使用承認が絡みうるため拡張 zip には入れない
- GeoNLP の **読み無し** KSJ（空港・道の駅・駅など）
- **駅データ.jp 無料 CSV** — `station_name_k` が空（読みは有料側）。代替として NEologd `*駅` を使用

## 出典（再配布時）

拡張の `COPYING` / `NOTICE` / `licenses/` に記載。加工物である旨も明記すること。
