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
| 無人で強化 | Actions: **日次 CF 合成** + 週次 retrain-lite（Mac不要・¥0） |

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

## GitHub Actions（最適・¥0・Mac不要）

軽利用向けの既定構成です。枠は十分余るので **6時間ごとではなく日次1回**。

[`.github/workflows/learning-loop.yml`](../.github/workflows/learning-loop.yml)

| トリガ | Runner | 内容 |
|--------|--------|------|
| `mode=smoke` | ubuntu-latest | dry + 3ベンチ |
| cron 毎日 04:00 UTC / `mode=synth` | ubuntu-latest | Cloudflare Workers AI 無料枠で合成 |
| cron 月曜 03:00 UTC / `mode=retrain` | ubuntu-latest | merge + ルール学習 + 3ベンチ |

1日あたり想定呼び出し ~100回・枠の数%〜2割程度。Workers **Free** のまま（Paid に上げない）。

### 一回だけ（無料アカウント）

1. [Cloudflare](https://dash.cloudflare.com/) 無料登録  
2. Account ID（Overview）と Workers AI 用 API Token  
3. secrets:

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
gh workflow run learning-loop.yml -f mode=smoke
gh workflow run learning-loop.yml -f mode=synth -f per_target=1
```

### 任意・高精度（この Mac の Ollama）

```bash
LEARN_PROVIDER=ollama npm run learn:synth
```

ModernBERT 本番再学習だけローカル `.venv-reading` が要る（通常は不要）。

## LLM 教師合成

| 経路 | 費用 | 備考 |
|------|------|------|
| **Groq（既定・最適）** | ¥0 | 日次・3ファミリー・Mac不要 |
| Cloudflare Workers AI | ¥0 | 一部アカウントで REST が 401（今回） |
| Ollama ローカル | 電気代のみ | 任意・高精度 |

Groq 等の太い無料枠は「枠が足りなくなったら」で十分。いまの負荷では過剰です。

## 一度回すコマンド（推論 Smoke）

```bash
npm run learn && npm run build
npm run reading-engine:test
npm run learn:reranker-dry
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod
npm run reading-engine
```

本番規模（NDL）: `npm run learn:ndl`（評価ゲートなしのモデル差し替えはしない）。
