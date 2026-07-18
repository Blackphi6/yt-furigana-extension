# YT Furigana local reading engine

Local-first reading API for the Chrome extension. No cloud fee.

設計は **候補制約型読み付け**（候補ラティス内選択・低確信フォールバック）です。第三者製品との提携・互換表明は行いません。
**「LLM に自由に読ませない」** です。出力は常に候補ラティス内に制約されます。

## 推論パイプライン（幻覚が構造的に起きない順）

```
入力テキスト
  ├─ 1. user_dict（最優先・confidence=1.0）
  ├─ 2. trust regex（下手に出る→したて 等。LLM審判が全滅する慣用句）
  ├─ 3. UniDic + heteronym → 候補ラティス（base を必ず含む）
  ├─ 4. ModernBERT pair rerank（任意）／なければ cue ルール
  └─ 5. 確信度 < 閾値 → 辞書（base）へ安全フォールバック
```

候補外の読みはコード上 `assert` 相当のガードで採用しません。

## Research notes (2026-07)

| Option | Status | Notes |
|--------|--------|-------|
| **商用読み API（例）** | 各社提供 | 参照用。本エンジンは独立実装 |
| **Yomikata**（第三者 OSS） | Open (~94%, 130 heteronyms) | 参考比較。本エンジンとは無関係 |
| **ModernBERT-Ja** (SB Intuitions 30m–310m) | Best open encoder base | Needs fine-tune for readings |
| **llm-jp-modernbert** | Open | Similar; not SOTA over SB Intuitions on JGLUE |

**This MVP** = lattice + trust + NDL-trained ModernBERT (optional) + cue fallback + creative-ruby.

## 手順（記事順 / 最適）

1. **ラティスを固める** — `heteronym-candidates.json` + UniDic base。合成ラベルはトークン境界一致のみ採用（預金の「金」問題）。
2. **慣用句は trust 表** — `trust_patterns.py`（下手に出る 等）。LLM 審判に任せない。
3. **NDL 本学習** — `npm run learn:ndl`（青空+書誌 → lattice softmax → seed/holdout ゲート → `artifacts/reranker-prod`）
4. **閾値フォールバック** — `YT_FURIGANA_RERANKER_THRESHOLD=0.55`（既定）
5. **評価ゲート** — `npm run reading-engine:test` / seed smoke（悪化で昇格拒否）
6. **商用 LLM API 出力は学習禁止** — オープンウェイトの生成×別ファミリー盲検×仲裁のみ

```bash
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-prod
npm run reading-engine
```

## Freemium endpoints

| Path | Auth | Notes |
|------|------|-------|
| `POST /v1/readings` | optional | Set `YT_FURIGANA_API_KEYS` to require Bearer |
| `POST /v1/license/verify` | license in body | Activates Premium in the extension |
| `GET/PUT /v1/dict/sync` | Bearer license | Per-license user dictionary |
| `GET /v1/dict/shared` | Bearer license | Shared pack |
| `POST /v1/admin/mint-license` | admin token | `YT_FURIGANA_ADMIN_TOKEN` |

Demo license: `ytfp_live_demo_key_001` — see `docs/FREEMIUM.md`.

## Run

```bash
python3 -m venv .venv-reading
.venv-reading/bin/pip install -r reading-engine/requirements.txt

npm run reading-engine
# → http://127.0.0.1:8765/v1/readings

# Optional ModernBERT (after smoke/full train)
export YT_FURIGANA_RERANKER_PATH=reading-engine/train/artifacts/reranker-smoke
npm run reading-engine
```

Extension: engine **読みAPI** → URL `http://127.0.0.1:8765`

## Public demo (Hugging Face Spaces · ¥0)

Docker image for always-on CPU demo (no ModernBERT):

```bash
# from repo root
docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
docker run --rm -p 7860:7860 yt-furigana-readings
```

GitHub Action: `.github/workflows/deploy-reading-space.yml`（secret `HF_TOKEN`）。

Expected URL: `https://blackphi6-yt-furigana-readings.hf.space`  
Site: https://blackphi6.github.io/yt-furigana-extension/

```bash
npm run reading-engine:test
curl -s http://127.0.0.1:8765/v1/readings -H 'content-type: application/json' \
  -d '{"text":"交渉では下手に出る。市場規模を見た。","user_dict":[{"surface":"東海林","reading":"しょうじ"}]}' \
  | python3 -m json.tool
```
