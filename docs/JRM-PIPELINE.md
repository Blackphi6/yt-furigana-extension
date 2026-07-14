# JRM 互換パイプライン（読みの幻覚を構造的に防ぐ）

参照: [Zenn / JRM 記事](https://zenn.dev/nixo/articles/3139042d4034f2)

## 記事の懸念 → このリポでの充足

| 懸念 | 充足 |
|------|------|
| LLM に自由生成で読ませない | 候補ラティス内選択のみ（`heteronym-candidates` + UniDic） |
| 慣用句を LLM 審判だけに任せるな | `trust_patterns.py` + JS `CONTEXT_READING_RULES` / learned cues |
| 境界不一致ラベルを学習するな | `build_ndl_train.py` 境界ゲート |
| 確信度だけで自信過剰 | 閾値未満は base フォールバック |
| 商用 API を教師にするな | オープンウェイトのみ（Ollama 3 ファミリー盲検） |
| ドメイン合成を回せ | `learn:synth` → `merge` → `corpus/synth-open.jsonl` |
| 評価ゲートなしで昇格するな | 3 ベンチ + `gate-baseline.json`（低下拒否） |
| 無人で強化 | Actions: 6h synth + 週次 retrain（**self-hosted Mac**） |

## やること / やらないこと

| やる | やらない |
|------|----------|
| 候補ラティス内から選ぶ | LLM に自由生成で読ませる |
| 慣用句は trust / context cues | LLM 審判だけに慣用句を任せる |
| トークン境界一致のラベルだけ学習 | 「預金」の中の「金」を単独学習 |
| 低確信は辞書へフォールバック | 確信度だけ見て自信過剰を信じる |
| オープンウェイト合成＋盲検 | 商用 API 出力を学習データに入れる |
| 3 ベンチ通過後のみ baseline 更新 | 失敗モデルの自動昇格 |

## 実装上の順序（推論）

1. **user_dict** — リクエスト単位（人名など）。最優先。
2. **trust_patterns** — `下手に出る`→`したて`、`市場規模`→`しじょう`、`ただ永遠に`→`とわ` …
3. **ラティス** — UniDic base + `heteronym-candidates.json` + cue/creative（候補外禁止）
4. **rerank** — `YT_FURIGANA_RERANKER_PATH` があれば ModernBERT pair、なければ cue
5. **閾値** — `YT_FURIGANA_RERANKER_THRESHOLD`（既定 0.55）未満は base

コード: `reading-engine/reading_engine/{__init__,trust_patterns,reranker}.py`

## 学習オートループ

```text
synth (生成×盲検×仲裁)
  → merge → data/learning/corpus/synth-open.jsonl  （git 追跡）
  → learn (ルール) + ndl-build/train（境界ゲート）
  → evaluate-three-benches（seed / hard / easy）
  → gate-baseline 更新（悪化なら失敗・昇格なし）
```

```bash
# 一括（ローカル）
npm run learn:autoloop:smoke              # dry + 3ベンチ
npm run learn:autoloop:synth -- --per-target 2
npm run learn:autoloop:retrain             # NDL 再学習 + ゲート
npm run learn:autoloop:full -- --fast      # 軽量合成込みフル

# 部品
npm run learn:synth / learn:synth:fast / learn:synth:dry
npm run learn:merge
npm run learn:gate
npm run learn:gate -- --write-baseline
```

追跡する学習資産:

- `data/learning/corpus/synth-open.jsonl` — 受理済み合成（候補内 gold のみ）
- `data/learning/benches/*.jsonl` — hard / easy
- `data/learning/gate-baseline.json` — 直近合格スコア
- `data/generated/learned-overrides.json` — cue 昇格（モデル重みは gitignore）

一時ファイル（gitignore）: `synth-accepted/rejected/log.jsonl`、NDL 中間 jsonl、`artifacts/`

## GitHub Actions

[`.github/workflows/learning-loop.yml`](../.github/workflows/learning-loop.yml)

| トリガ | Runner | 内容 |
|--------|--------|------|
| `workflow_dispatch` mode=smoke | ubuntu-latest | dry + 3ベンチ |
| cron 6h / mode=synth | **self-hosted macOS ARM64** | Ollama 合成 → corpus コミット |
| cron 月曜 / mode=retrain | **self-hosted macOS ARM64** | build+train+ゲート → baseline コミット |

self-hosted 手順（この Mac 一回）:

1. [Runners](https://github.com/Blackphi6/yt-furigana-extension/settings/actions/runners/new) で macOS ARM64 登録
2. ラベル: `self-hosted`, `macOS`, `ARM64`
3. `ollama serve` 常駐、モデル取得済み（`gpt-oss:20b` / `qwen2.5:14b` / `gemma4:e4b`）
4. リポ clone 先で Node 22 + `.venv-reading`（retrain 用）

```bash
gh workflow run learning-loop.yml -f mode=smoke
gh workflow run learning-loop.yml -f mode=synth -f per_target=2
gh workflow run learning-loop.yml -f mode=retrain
```

Ubuntu だけでは本 LLM 合成・ModernBERT 再学習は回せない（記事どおりローカル／self-hosted）。

## LLM 教師合成（生成×盲検検証×仲裁）

記事どおり **商用 API は使わない**。このマシン（M3 Pro / 36GB）向けに量子化済みを順次ロード:

| 役割 | 記事の想定 | この PC の選択 | 理由 |
|------|------------|----------------|------|
| 生成 | gpt-oss-120b | `gpt-oss:20b` (MXFP4 ~13GB) | 同系統・メモリに収まる |
| 検証 | qwen3.5 | `qwen2.5:14b` (Q4 ~9GB) | 別ファミリー |
| 仲裁 | zai-glm-4.7 | `gemma4:e4b` (Q4 ~10GB) | 第3ファミリー |

3 モデル同時は禁止（`keep_alive=0`）。慣用句は LLM 審判対象外（trust / cues）。

受理ラベルは `synth-accepted.jsonl`（一時）→ `learn:merge` で `corpus/synth-open.jsonl` に合流し、`build_ndl_train.py` の seed に載る。

## 一度回すコマンド（推論 Smoke）

```bash
npm run learn && npm run build
npm run reading-engine:test
npm run learn:reranker-dry
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod
npm run reading-engine
```

本番規模（NDL）: `npm run learn:ndl`（評価ゲートなしのモデル差し替えはしない）。
