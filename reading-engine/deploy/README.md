# Public reading API image (Render / Docker)

Lightweight **candidate-constrained** Japanese reading engine for the
[YT Furigana demo site](https://blackphi6.github.io/yt-furigana-extension/).

- No free-form LLM readings (lattice / trust / cue only)
- `GET /health` · `POST /v1/readings` · OpenAPI at `/docs`
- Free pack: `GET /v1/shared-readings` (curated phrases + opt-in votes)
- CORS: GitHub Pages

## Deploy (free): Render

Repo root `render.yaml` → Render Dashboard → **New** → **Blueprint**.

Expected URL: `https://yt-furigana-readings.onrender.com`

Hugging Face Docker Spaces currently often require PRO; prefer Render free.

### Shared readings pack (silent Free improvements)

1. After `npm run learn:promote` (or manually):
   ```bash
   npm run export:shared-readings
   ```
   Writes `data/generated/shared-readings-seed.json` (**phrases only**, no captions).

2. Commit the seed + redeploy the Web Service (**Manual Deploy**), **or** publish live:
   ```bash
   # Dashboard → Environment → add YT_FURIGANA_ADMIN_TOKEN (secret)
   export YT_FURIGANA_ADMIN_TOKEN=...
   export YT_FURIGANA_PUBLISH_URL=https://yt-furigana-readings.onrender.com
   npm run publish:shared-readings
   ```

3. Extensions with `sharedPackEnabled` (default on) fetch the pack on startup
   (throttled) — no Chrome Web Store update required for phrase improvements.

Votes from opt-in corrections are stored under `data/premium/` on the instance.
Render free disks are ephemeral; **curated seed in the image** is the durable path.
Add a persistent disk only if you need vote history across redeploys.

### Production hardening (required for public service)

`render.yaml` sets `YT_FURIGANA_ENV=production`, disables Stripe dry-run and demo
license auto-create. Also set in Dashboard:

- `YT_FURIGANA_ADMIN_TOKEN` (secret)
- `YT_FURIGANA_LICENSE_KEYS` (optional; survives redeploys)
- `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` before selling Premium

OpenAPI `/docs` is disabled when hosted as production.

## ModernBERT reranker（文脈読み分け）

`reading-engine/data/reranker-deploy/`（INT8 約 35MB）をイメージに同梱します。

```bash
npm run learn:ndl              # 学習 → ONNX export → deploy バンドル更新
# または既存 prod から:
npm run learn:ndl-export-onnx
```

`GET /health` の `reranker.loaded` / `reranker.backend` で確認できます。

## Local Docker

```bash
# from repo root（reranker-deploy があること）
docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
docker run --rm -p 7860:7860 yt-furigana-readings
curl -s http://127.0.0.1:7860/health | jq .reranker
```
