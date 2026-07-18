# Public reading API image (Render / Docker)

Lightweight **candidate-constrained** Japanese reading engine for the
[YT Furigana demo site](https://blackphi6.github.io/yt-furigana-extension/).

- No free-form LLM readings (lattice / trust / cue only)
- `GET /health` · `POST /v1/readings` · OpenAPI at `/docs`
- CORS: GitHub Pages

## Deploy (free): Render

Repo root `render.yaml` → Render Dashboard → **New** → **Blueprint**.

Expected URL: `https://yt-furigana-readings.onrender.com`

Hugging Face Docker Spaces currently often require PRO; prefer Render free.

## Local Docker

```bash
# from repo root
docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
docker run --rm -p 7860:7860 yt-furigana-readings
```
