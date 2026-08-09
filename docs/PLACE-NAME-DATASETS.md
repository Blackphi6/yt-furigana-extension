# 地名データセット（商用利用可能な読み付き）

最終更新: 2026-08-10

字幕ルビ用に、**漢字表層 → ひらがな読み**だけを抽出して同梱する。

## ビルド

```bash
npm run dict:place-names
npm run build
```

出力: `data/generated/place-name-phrases.json.gz` → `dict/place-name-phrases.json.gz`

Pages デモ用サブセット: `place-name-phrases-site.json`（都道府県・市区町村・区・地名集・GeoNLP の pref/POI。町丁目全文は載せない）→ `site/place-name-phrases.json`

## 取り込み済み

| ソース | ライセンス | 内容 |
|--------|------------|------|
| [Geolonia japanese-addresses](https://github.com/geolonia/japanese-addresses) | CC BY 4.0 | 都道府県・市区町村・町丁目＋カナ |
| [デジタル庁 ABR](https://www.digital.go.jp/policies/base_registry_address) | PDL1.0（商用可・出典必須） | 町字マスタ等＋カナ |
| [国土地理院 地名集日本](https://www.gsi.go.jp/kihonjohochousa/gazetteer.html) | PDL1.0（出典必須） | 標準地名〜約3900（かな付き）。機械可読は LinkData |
| [GeoNLP](https://geonlp.ex.nii.ac.jp/dictionary/)（読み付きのみ） | CC BY 4.0 | 都道府県 / 歴史地名大系 地名・POI |

優先: Geolonia → ABR で上書き拡充 → 地名集 → GeoNLP。実行時 Trie は NEologd < 地名 < 人名。

## 同梱しない

- **電子国土基本図（地名情報）** — 読み付きだが測量成果。複製・使用承認が絡みうるため拡張 zip には入れない
- GeoNLP の **読み無し** KSJ（空港・道の駅・駅など）

## 出典（再配布時）

拡張の `COPYING` / `NOTICE` / `licenses/` に記載。加工物である旨も明記すること。
