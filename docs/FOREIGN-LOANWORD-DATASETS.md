# 外来語・カタカナ読みデータセット調査

最終更新: 2026-08-07  
**法的助言ではありません。** 本拡張の同梱方針（ShareAlike 回避・帰属必須）に照らした整理です。

## プロジェクト要件（要約）

- 拡張 zip に載せる辞書は **再ライセンス可能な permissive**（MIT / Apache-2.0 / BSD / CC0 / NAIST・ICOT 条件付き IPADIC）
- **ShareAlike（CC BY-SA 等）は意図的に使わない**（[`docs/ENGLISH-KATAKANA.md`](ENGLISH-KATAKANA.md)、[`docs/TRADEMARK-AND-ATTRIBUTION.md`](TRADEMARK-AND-ATTRIBUTION.md)）
- 商用配布（Chrome Web Store）でも帰属・NOTICE を維持できること

## 候補の判定

| データ | ライセンス | 商用 | 本プロジェクト | 理由 |
|--------|------------|------|----------------|------|
| **SudachiDict** | Apache-2.0 | 可 | **採用済み** | `sudachi-wasm333` 経由で `system.dic` 同梱済み |
| **mecab-ipadic-NEologd** | Apache-2.0 | 可（帰属） | **採用済み** | 固有名詞フレーズ抽出のみ同梱 |
| **CMUdict** | BSD-2-Clause | 可（帰属） | **採用済み** | 英→カタカナのベース |
| **日本語 Wiktionary** | CC BY-SA 4.0 | 条件付き可 | **不採用** | ShareAlike。派生辞書も SA 継承リスク |
| **JMdict / EDICT2** | 実質 CC BY-SA 系 | 条件付き可 | **不採用** | 同上（英カタカナ用途で明示除外済み） |
| **Tkrzw-Dict** | ソフトは Apache-2.0 | ツールは可 | **データは不採用** | Wiktionary 等を統合。**中身のライセンスは上流依存**で SA を洗えない |
| **EJDict (ejdict-hand)** | CC0-1.0 / PD | 可 | **読み用途は非採用** | 英→**意味**辞書。カタカナ読み専用ではない。厳密抽出しても固有名詞ノイズが多く、字幕ルビ精度への寄与が薄い |

## 精度上の本丸

字幕の「外来語」問題は次の2層:

1. **すでにカタカナの語**（スマートフォン等）→ Sudachi / NEologd が主。ルビ不要が多い  
2. **欧文のままの語**（Information / YouTube）→ CMUdict の**米音規則転写**が日本語慣用（インフォメーション / ユーチューブ）とずれる

したがって追加するのは ShareAlike 辞書ではなく、**MIT の日本語慣用カタカナ上書き**（[`data/english-katakana-ja-convention.json`](../data/english-katakana-ja-convention.json)）。`npm run dict:english` で CMUdict 変換結果の上にマージする。

## 参照

- SudachiDict: https://github.com/WorksApplications/SudachiDict  
- EJDict: https://github.com/kujirahand/EJDict（CC0）  
- Tkrzw-Dict: https://github.com/estraier/tkrzw-dict  
- JMdict/EDICT: https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project  
- CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/
