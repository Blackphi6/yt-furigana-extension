---
title: YT Furigana Readings
emoji: 📖
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Candidate-constrained Japanese reading API (CPU, free demo)
---

# YT Furigana public reading API

Lightweight **candidate-constrained** Japanese reading engine for the
[YT Furigana demo site](https://blackphi6.github.io/yt-furigana-extension/).

- No free-form LLM readings (lattice / trust / cue only on this Space)
- `GET /health` · `POST /v1/readings` · OpenAPI at `/docs`
- CORS: GitHub Pages

## Deploy

This folder is the Space card. Build context is the **repository root**
(see `Dockerfile` comments). Prefer the GitHub Action
`deploy-reading-space.yml` with secret `HF_TOKEN`, or:

```bash
# from repo root
docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
docker run --rm -p 7860:7860 yt-furigana-readings
```

Expected public URL after Space create:

`https://blackphil-yt-furigana-readings.hf.space`
