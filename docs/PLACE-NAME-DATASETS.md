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

- `place-name-phrases-site.json` → `site/place-name-phrases.json`
- `station-phrases-site.json` → `site/station-phrases.json`

補完: `data/place-name-extra.json`（手置き。例: `神子畑` / `神子畑選鉱場跡`）

## 取り込み済み（地名）

| ソース | ライセンス | 内容 |
|--------|------------|------|
| [Geolonia japanese-addresses](https://github.com/geolonia/japanese-addresses) | CC BY 4.0 | 都道府県・市区町村・町丁目＋カナ |
| [デジタル庁 ABR](https://www.digital.go.jp/policies/base_registry_address) | PDL1.0（商用可・出典必須） | 町字マスタ等＋カナ |
| [国土地理院 地名集日本](https://www.gsi.go.jp/kihonjohochousa/gazetteer.html) | PDL1.0（出典必須） | 標準地名〜約3900（かな付き） |
| [GeoNLP](https://geonlp.ex.nii.ac.jp/dictionary/)（読み付きのみ） | CC BY 4.0 | 都道府県 / 歴史地名大系 地名・POI |
| [日本郵便 KEN_ALL](https://www.post.japanpost.jp/zipcode/dl/utf-zip.html) | 郵便番号データ利用許諾 | 既存に無い町域のみギャップ埋め |
| [NEologd](https://github.com/neologd/mecab-ipadic-neologd) 固有名詞/地域 | Apache-2.0 | 既存に無い地域表層（`*駅`は駅辞書へ） |
| 複合→裸表層派生 | 加工 | `神子畑村`→`神子畑` のように接尾辞を剥がす |
| `data/place-name-extra.json` | 手置き | オープンデータに無い観光表記など |

優先: Geolonia → ABR → 地名集 → GeoNLP → KEN_ALL → NEologd 地域 → 裸派生 → **extra（上書き可）**。

## 取り込み済み（駅）

| ソース | ライセンス | 内容 |
|--------|------------|------|
| NEologd 種子の `*駅` | Apache-2.0 | `放出駅`→`はなてんえき`、`放出`→`はなてん` |

実行時 Trie: NEologd < UniDic < 地名 < **駅** < 人名。

## 同梱しない（調査済み）

| ソース | 理由 |
|--------|------|
| 電子国土基本図（地名情報） | 測量成果・承認が絡みうる |
| GeoNLP KSJ / nihu-placename / 歴史的行政区域β / 江戸マップ | **カナ無し** |
| 国交省位置参照情報 | **カナ無し**（商用可だが読み辞書に不向き） |
| OSM `name:ja-Hira` | ODbL 共有義務が重い |
| JMnedict / ENAMDICT | CC BY-SA |
| 国土地理協会・行政区画便覧など | **有償・再配布不可** |
| 駅データ.jp 無料 CSV | `station_name_k` 空 |

## 出典（再配布時）

拡張の `COPYING` / `NOTICE` / `licenses/` に記載。加工物である旨も明記すること。
