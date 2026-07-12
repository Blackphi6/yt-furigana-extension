# JRM 互換パイプライン（読みの幻覚を構造的に防ぐ）

参照: [Zenn / JRM 記事](https://zenn.dev/nixo/articles/3139042d4034f2)

## やること / やらないこと

| やる | やらない |
|------|----------|
| 候補ラティス内から選ぶ | LLM に自由生成で読ませる |
| 慣用句は trust 正規表現 | LLM 審判だけに慣用句を任せる |
| トークン境界一致のラベルだけ学習 | 「預金」の中の「金」を単独学習 |
| 低確信は辞書へフォールバック | 確信度だけ見て自信過剰を信じる |
| オープンウェイト合成＋盲検 | 商用 API 出力を学習データに入れる |

## 実装上の順序（このリポ）

1. **user_dict** — リクエスト単位（人名など）。最優先。
2. **trust_patterns** — `下手に出る`→`したて`、`市場規模`→`しじょう`、`永遠に`→`とわ` …
3. **ラティス** — UniDic base + `heteronym-candidates.json` + cue/creative（候補外禁止）
4. **rerank** — `YT_FURIGANA_RERANKER_PATH` があれば ModernBERT pair、なければ cue
5. **閾値** — `YT_FURIGANA_RERANKER_THRESHOLD`（既定 0.55）未満は base

コード: `reading-engine/reading_engine/{__init__,trust_patterns,reranker}.py`

## 一度回すコマンド

```bash
# A. ルール／文脈学習（拡張ローカル）
npm run learn && npm run build

# B. エンジン契約テスト（候補外禁止を含む）
npm run reading-engine:test

# C. ModernBERT smoke（候補内 binary）
npm run learn:reranker-dry
npm run learn:reranker-smoke
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-smoke
npm run reading-engine
```

本番規模（NDL 青空・書誌）は `reading-engine/train/README.md` の Phase 2。
評価ゲートなしのモデル差し替えはしない。
