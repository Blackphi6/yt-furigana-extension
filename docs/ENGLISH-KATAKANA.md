# 英単語 → カタカナ読み（CMUdict）

字幕中の欧文にカタカナ読みを付ける。商用利用しやすい **CMUdict (BSD-2-Clause) + 自前規則** のみを使う（JMdict / Wiktionary の ShareAlike は使わない）。

## 流れ

1. `npm run dict:english` で CMUdict を取得し ARPAbet → カタカナへ事前変換
2. 成果物 `data/generated/english-katakana.json.gz` を拡張の `dict/` へコピー
3. `applyEnglishKatakanaReadings` が Latin トークンへ `preserveKatakana` 付きで読みを載せる
4. ユーザー登録読み（手動辞書）が後段で上書き可能

## ライセンス

- CMUdict: BSD-2-Clause（帰属必須）→ `NOTICE` / `third_party/BSD-CMUdict.txt`
- 変換規則: 本リポジトリ MIT（`src/arpabet-katakana.js`）

## 限界

米音ベースの規則転写のため、慣用の和製英語（インフォメーション等）と一致しない語がある。クリック登録で上書きできる。
