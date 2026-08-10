# 法人名・Wikidata・Sudachi Full フレーズ（商用利用）

最終更新: 2026-08-10

字幕ルビ用に、**漢字表層 → ひらがな読み**だけを抽出して同梱する。

## 取り込み済み

| ソース | ライセンス | 同梱 | 使い方 |
|--------|------------|------|--------|
| [国税庁 法人番号公表サイト](https://www.houjin-bangou.nta.go.jp/download/zenken/) 全件 CSV（Unicode） | 公共データ利用規約（商用可・出典必須） | `corporate-name-phrases.json.gz` | 公式フリガナ。`株式会社` 等を剥がした **2–16 文字**の短い表層のみ（全社名は載せない＝メモリ対策） |
| [Wikidata P1814](https://www.wikidata.org/wiki/Property:P1814) | CC0-1.0 | `wikidata-kana-phrases.json.gz` | 日本語ラベル＋かな。人名など姓辞書の穴埋め（低優先） |
| [SudachiDict notcore_lex](https://github.com/WorksApplications/SudachiDict) | Apache-2.0 | `sudachi-full-phrases.json.gz` | Full 専有の固有名詞読み。**system.dic は Full に差し替えない**（zip 肥大回避） |

## Trie 優先（後勝ち）

NEologd < UniDic < Wikidata < Sudachi Full固有 < 地名 < 駅 < **法人** < **人名**

## ビルド

```bash
npm run dict:corporate-names
npm run dict:wikidata-kana
npm run dict:sudachi-full
npm run build
```

Pages は各 `*-site.json`（薄いサブセット）のみ。

## 意図的にやらないこと

- Sudachi Full の `system.dic` 丸ごと同梱（数百 MB 級）
- JCLdic（別名生成が主で、slim は furigana 無し）
- JMnedict（CC BY-SA）
