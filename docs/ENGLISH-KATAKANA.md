# 英単語 → カタカナ読み（CMUdict + 日本語慣用）

字幕中の欧文にカタカナ読みを付ける。商用利用しやすいデータのみ:

1. **CMUdict (BSD-2-Clause)** — 広域カバーのベース
2. **日本語慣用上書き (MIT)** — [`data/english-katakana-ja-convention.json`](../data/english-katakana-ja-convention.json)

**使わない:** JMdict / EDICT2 / 日本語 Wiktionary（CC BY-SA 等の ShareAlike）。調査メモは [`docs/FOREIGN-LOANWORD-DATASETS.md`](FOREIGN-LOANWORD-DATASETS.md)。

## 流れ

1. `npm run dict:english` で CMUdict を取得し ARPAbet → カタカナへ事前変換
2. 同じコマンドで慣用上書きを後勝ちマージ
3. 成果物 `data/generated/english-katakana.json.gz` を拡張の `dict/` へコピー
4. `applyEnglishKatakanaReadings` が Latin トークンへ `preserveKatakana` 付きで読みを載せる
5. ユーザー登録読み（手動辞書）が後段で上書き可能

## ライセンス

- CMUdict: BSD-2-Clause（帰属必須）→ `NOTICE` / `third_party/BSD-CMUdict.txt`
- 変換規則: 本リポジトリ MIT（`src/arpabet-katakana.js`）
- 慣用上書き: 本リポジトリ MIT（`data/english-katakana-ja-convention.json`）

## 限界

慣用リストに無い語は引き続き CMUdict 規則転写。クリック登録で上書きできる。
