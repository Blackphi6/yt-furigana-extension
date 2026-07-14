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

本番規模（NDL 青空・書誌）:

```bash
npm run learn:ndl   # fetch → build（境界ゲート）→ train（seed/holdout 評価ゲート）
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod
```

評価ゲートなしのモデル差し替えはしない。詳細は `reading-engine/train/README.md`。

## GitHub Actions（無人の入口）

指示書: [`.github/workflows/learning-loop.yml`](../.github/workflows/learning-loop.yml)

- **いまできること**: Actions 上で `learn:synth:dry` + seed-bench + 契約テスト（手動 `workflow_dispatch`）
- **まだ Actions ではやらないこと**: `gpt-oss:20b` などの本 LLM 合成（Runner の RAM 不足）→ **ローカル Mac** で `npm run learn:synth`

```bash
# Actions を一回手動実行
gh workflow run learning-loop.yml
gh run watch
```

## LLM 教師合成（生成×盲検検証×仲裁）

記事どおり **商用 API は使わない**。このマシン（M3 Pro / 36GB）向けに量子化済みを順次ロード:

| 役割 | 記事の想定 | この PC の選択 | 理由 |
|------|------------|----------------|------|
| 生成 | gpt-oss-120b | `gpt-oss:20b` (MXFP4 ~13GB) | 同系統・メモリに収まる |
| 検証 | qwen3.5 | `qwen2.5:14b` (Q4 ~9GB) | 別ファミリー |
| 仲裁 | zai-glm-4.7 | `gemma4:e4b` (Q4 ~10GB) | 第3ファミリー（既取得） |

3 モデル同時は禁止（`keep_alive=0`）。慣用句（下手に出る等）は LLM 審判対象外。

```bash
npm run learn:synth:dry          # 設定確認
npm run learn:synth:fast -- --limit 2 --per-target 2   # 軽量モデルで煙テスト
npm run learn:synth              # 本番セット（順次ロード）
# 受理 → data/learning/synth-accepted.jsonl （ndl-build の seed に自動合流）
```
