# 漢字・語読みデータセット（商用利用）

最終更新: 2026-08-10

字幕ルビの穴埋め用に、商用利用可能な公開データを同梱する。

## 取り込み済み

| ソース | ライセンス | 同梱 | 使い方 |
|--------|------------|------|--------|
| [Unicode Unihan](https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip) | Unicode License | `kanji-readings.json.gz` | 読み無しの**単漢字**フォールバック + 候補 |
| [現代書き言葉 UniDic 3.1.1](https://clrd.ninjal.ac.jp/unidic/) | GPL/LGPL/BSD → **BSD** | `unidic-phrases.json.gz` | 漢字のみ名詞フレーズ（固有名詞除外） |

## 同梱しない

| ソース | 理由 |
|--------|------|
| [MJ文字情報一覧表](https://moji.or.jp/mojikiban/mjlist/) | 公式は **CC BY-SA 2.1 JP**（継承義務）。Unihan の `kJapanese` が同系統の読みを Unicode License で再配布しているため、MJ 本体は載せず Unihan を使う |

## ビルド

```bash
npm run dict:kanji-readings
npm run dict:unidic
npm run build
```

差分計測（取り込み前後で新しく読める数）:

```bash
node scripts/eval-kanji-unidic-delta.mjs
```

## 効果の見方

- **Unihan**: 形態素が読みを返せない単漢字（稀字・難字）にルビが付く
- **UniDic**: 既存の Kuromoji/Sudachi でも多くの漢語は読めるが、読み無しで返った漢語名詞や、分割された表層の最長一致で穴を埋める
