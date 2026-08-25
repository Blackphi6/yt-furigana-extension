# 候補制約型読みパイプライン（読みの幻覚を構造的に防ぐ）

本リポジトリの読みエンジンは、**候補ラティス内からのみ読みを選ぶ**設計です。第三者の製品名・サービス名との提携・後援・互換を示す表現は使いません。

## 設計上の懸念 → このリポでの充足

| 懸念 | 充足 |
|------|------|
| LLM に自由生成で読ませない | 候補ラティス内選択のみ（`heteronym-candidates` + UniDic） |
| 慣用句を LLM 審判だけに任せるな | `trust_patterns.py` + JS `CONTEXT_READING_RULES` / learned cues |
| 境界不一致ラベルを学習するな | `build_ndl_train.py` 境界ゲート |
| 確信度だけで自信過剰 | 閾値未満は base フォールバック |
| 商用 API を教師にするな | オープンウェイトのみ（Ollama 3 ファミリー盲検） |
| ドメイン合成を回せ | `learn:synth` → `merge` → `corpus/synth-open.jsonl` |
| 評価ゲートなしで昇格するな | 3 ベンチ + `gate-baseline.json`（低下拒否） |
| 無人で強化 | Actions: **2h 合成(12/day)** + **6h promote(4/day)** + 週次 eval:g2p + 月次全文（Mac不要・¥0） |

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
   拡張側では **NEologd／学習フレーズの文中ヒット** もここに載せて送る（辞書＋読み API 併用）。
2. **trust_patterns** — `下手に出る`→`したて`、`市場規模`→`しじょう`、`ただ永遠に`→`とわ`、`の中`→`なか`、`街と`→`まち` …
3. **ラティス** — UniDic base + `heteronym-candidates.json` + cue/creative（候補外禁止）
3.5. **単独漢字 morph_base** — 前後が漢字でない1字は、少数派キューが無い限り UniDic base を BERT より優先（街→がい、短い字幕の on 読み事故）
4. **rerank** — `reranker-deploy`（ONNX INT8 約35MB）があれば自動ロード。高確信キュー（≥0.85）→ morph_base → reranker → 低確信キュー
5. **閾値** — `YT_FURIGANA_RERANKER_THRESHOLD`（既定 0.55）未満は base
6. **クライアント後処理** — span 応答にローカル句を再合成（`phrase-hits.js`）

### 併用の役割分担

| 層 | 担当 | 例 |
|----|------|-----|
| NEologd／学習／MANUAL | 読みがほぼ一意の固有名詞・固定句 | 固有名詞辞書エントリ（権利者との提携を意味しない） |
| 読み API（任意） | 同形異音・文脈依存 | 辛い、市場、下手に出る |
| ローカル Kuromoji 既定 | APIなしでも動くベース | 日常字幕 |
| 異体字照合正規化 | 表示は原文、辞書キーだけ常用形 | 髙橋→たかはし（[`PROPER-NOUN-READINGS.md`](PROPER-NOUN-READINGS.md)） |

ポップアップの「読みAPI（外部・辞書併用）」がこの経路。失敗時はローカル辞書へフォールバック。

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

### 人が正解を足す（LLM待ちなし）

候補袋に無い読みは選べません。答えを渡したら、先に袋へ入れます。

```bash
npm run learn:gold -- --text "会社の将来を背負って立つ" --surface 背負っ --reading しょっ --cue 将来を
npm run learn:gold -- --text "..." --surface 背負っ --reading しょっ --cue 将来を --apply
```

`--apply` は `learn:promote-cues` まで回します。読み API は再起動すると袋とキューが乗ります。

追跡する学習資産:

- `data/learning/heteronym-extra.json` — 生成辞書に無い活用形などの候補
- `data/learning/human-gold.jsonl` — 人が渡した正解
- `data/learning/corpus/synth-open.jsonl` — 受理済み合成（候補内 gold のみ）
- `data/learning/benches/*.jsonl` — hard / easy
- `data/learning/gate-baseline.json` — 直近合格スコア
- `data/generated/learned-overrides.json` — cue 昇格（モデル重みは gitignore）

## Free 向け「いつの間にか精度が上がる」経路

字幕・歌詞は再配布しない。届けるのは **`(表層 → 読み)` だけ**。

```text
promote / LLM 学習
  → data/generated/learned-overrides.json   （拡張バンドル用・cue 含む）
  → npm run export:shared-readings          （phrases のみシード化）
  → data/generated/shared-readings-seed.json
  → Docker に同梱 / または:
     YT_FURIGANA_ADMIN_TOKEN=... npm run publish:shared-readings
  → GET /v1/shared-readings
  → 拡張が起動時に sharedReadingDict へマージ（ストア更新不要）
```

| 層 | 中身 | ユーザーへの届き方 |
|----|------|-------------------|
| curated seed | 学習で確定した phrases | イメージ同梱 or admin PUT |
| contributions | オプトイン訂正の票集計 | ランタイム JSONL → 再集計 → `/v1/shared-readings` |
| contribution-stats | 表層・読み・票数のみの公開集計 | `npm run learn:import-contrib` → corpus → lattice / promote-cues |
| contextRules / reranker | 文脈・モデル | 拡張更新 or 読みAPI サーバー |

```bash
# シードだけ更新（コミット用）
npm run export:shared-readings

# Render へ即時配信（ADMIN_TOKEN 必須）
export YT_FURIGANA_ADMIN_TOKEN=...
export YT_FURIGANA_PUBLISH_URL=https://yt-furigana-readings.onrender.com
npm run publish:shared-readings
```

一時ファイル（gitignore）: `synth-accepted/rejected/log.jsonl`、NDL 中間 jsonl、`artifacts/`

## GitHub Actions（最適・¥0・Mac不要）

Groq 無料枠の **verify / arbitrate モデル（約 1000 RPD）** がボトルネックなので、
その上限付近まで自動で回します（generator の 8B は 1.4万 RPD あるので余りやすい）。

[`.github/workflows/learning-loop.yml`](../.github/workflows/learning-loop.yml)

| トリガ | Runner | 内容 |
|--------|--------|------|
| `mode=smoke` | ubuntu-latest | dry + 3ベンチ |
| cron **2h**（`5 */2 * * *`）/ `mode=synth` | ubuntu-latest | Groq 合成 12回/日（verify **~936 RPD**）+ レポート更新 |
| cron **日曜**（`15 4 * * 0`）/ `mode=debate` | ubuntu-latest | 検索＋3エージェント会話で cue 穴埋め → promote-cues |
| cron **6h**（`35 */6 * * *`）/ `mode=promote` | ubuntu-latest | overrides 昇格 4回/日（rescore 2000 + per-reading、eval:g2p 省略） |
| cron 月曜 03:30 UTC / `mode=retrain` | ubuntu-latest | **eval:g2p** + 昇格 + 3ベンチ（baseline 更新） |
| cron 毎月1日 04:00 UTC | ubuntu-latest | per-reading **13536 全文** |

想定: synth 1回 ≒ verify **78** × 12回/日 ≒ **936 RPD**（Groq verify 上限 1000 の 94%）。429 時は `Retry-After` で自動待機。

### 競合との差分（JRM 等）

| 項目 | JRM（[記事](https://zenn.dev/nixo/articles/3139042d4034f2)） | 本拡張 |
|------|------|--------|
| 合成 | 6h | **2h**（Groq 上限まで） |
| 昇格 | 週次 reranker 再学習 | **6h** overrides + 週次 eval:g2p |
| 幻覚防止 | 候補ラティス内選択 | 同型 + phrase trie guard |
| 同形異音 | ModernBERT reranker | Sarashina 式 **per-reading** + ja-tts/JVS ゲート |
| 配布 | API サーバー | **Chrome 拡張**に overrides 同梱 |

人手で同形異音を詰めたいとき:

```bash
npm run learn:promote-cues   # heteronym-cue-seed + synth コーパス → learned-overrides（ゲート付き）
npm run learn:gate
```

`data/learning/heteronym-cue-seed.json` にキューを足す → promote-cues で本番 overrides へ。

### Parayomi 看板デモの移植

[Parayomi Space](https://huggingface.co/spaces/Parakeet-Inc/Parayomi) の EXAMPLES を cue / hard-heteronym / site demo に載せている（モデル本体は非公開のためコピーしない）。定義: `scripts/learning/parayomi-examples.mjs`。

JKYB-Parakeet 失敗ランキングから cue を足す:

```bash
npm run learn:promote-parakeet-ranked -- --top=40 --apply
```

### agent-debate（検索＋エージェント会話）

候補ラティスにあるのに cue が無い読み（例: 上手×かみて）を、ウェブ検索＋3モデル会話で埋める。

```bash
npm run learn:debate -- --surface 上手 --reading かみて --limit 1
npm run learn:debate -- --limit 3 --apply   # cue-seed 更新後に promote-cues
npm run learn:autoloop:debate               # CI と同じ週次パス
```

流れ: GapFinder → WebSearch → Researcher → Critic → Judge → `heteronym-cue-seed` + `corpus/synth-open`（`source: agent-debate`）。会話ログは `data/learning/agent-debate-log.jsonl`（gitignore）。

#### 検索エンジン比較（2026）

| 優先 | エンジン | 日本語の当てやすさ | キー | 備考 |
|------|----------|-------------------|------|------|
| 1 | **Brave Search API** | 高 | `BRAVE_API_KEY` | 独立索引。AIエージェント向けの本命 |
| 2 | Google Custom Search | 最高〜高 | `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` | 網羅性は強いが設定が重い |
| 3 | Tavily | 高 | `TAVILY_API_KEY` | AI向けに整形済み |
| 4 | Exa | 中（英語向き） | `EXA_API_KEY` | 技術・英語は強い／一般日本語は弱め |
| — | Wikipedia JA | 高（用語） | 不要 | 日本語クエリでは**常にマージ** |
| 末 | DuckDuckGo Lite | 中 | 不要 | キー無しフォールバック |

Bing Web Search API は 2025 退役のため未対応。  
既定は「キーがある中で一番上」＋ Wikipedia JA。上書きは `SEARCH_PROVIDER=brave|google_cse|tavily|exa|ddg`。

```bash
# Brave を使う例（精度優先）
export BRAVE_API_KEY=...
npm run learn:debate -- --limit 3
```

### 一回だけ（無料アカウント）

1. [Groq Console](https://console.groq.com/keys) で API Key 作成  
2. secrets:

```bash
gh secret set GROQ_API_KEY
gh workflow run learning-loop.yml -f mode=smoke
gh workflow run learning-loop.yml -f mode=synth -f per_target=2
```

枠の残量は [console.groq.com/settings/limits](https://console.groq.com/settings/limits) で確認。
### 任意・高精度（この Mac の Ollama）

```bash
LEARN_PROVIDER=ollama npm run learn:synth
```

ModernBERT 本番再学習だけローカル `.venv-reading` が要る（通常は不要）。

## LLM 教師合成

| 経路 | 費用 | 備考 |
|------|------|------|
| **Groq（既定・最適）** | ¥0 | 日次・Llama + Qwen3.6 + GPT-OSS（欠落時は自動フォールバック） |
| Cloudflare Workers AI | ¥0 | 一部アカウントで REST が 401（今回） |
| Ollama ローカル | 電気代のみ | 任意・高精度 |

Groq 等の太い無料枠は **2時間ごと synth（12回/日）** で verify RPD 上限の 94% まで使います。
429 が出たら間隔を開けてリトライ（Paid は不要な想定）。

## 一度回すコマンド（推論 Smoke）

```bash
npm run learn && npm run build
npm run reading-engine:test
```bash
npm run learn:ndl              # fetch → build → train → ONNX export
npm run reading-engine         # reranker-deploy があれば ONNX 自動ロード
npm run learn:promote-reranker-distill  # 高確信 reranker 正解 → cue 候補
```
```

本番規模（NDL）: `npm run learn:ndl`（評価ゲートなしのモデル差し替えはしない）。
