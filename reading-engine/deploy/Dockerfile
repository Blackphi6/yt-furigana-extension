# Build from repository root:
#   docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
# Render free Web Service (and local): PORT env, default 7860
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=7860 \
    YT_FURIGANA_CORS_ORIGINS=https://blackphi6.github.io,http://127.0.0.1:4173,http://localhost:4173 \
    YT_FURIGANA_RERANKER_PATH= \
    YT_FURIGANA_RATE_LIMIT_PER_MIN=30 \
    PYTHONPATH=/app/reading-engine

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY reading-engine/requirements.txt /app/reading-engine/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/reading-engine/requirements.txt

COPY reading-engine/reading_engine /app/reading-engine/reading_engine
COPY reading-engine/data /app/reading-engine/data
COPY data/generated/heteronym-candidates.json /app/data/generated/heteronym-candidates.json
COPY data/creative-ruby /app/data/creative-ruby
COPY reading-engine/deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import os,urllib.request; p=os.environ.get('PORT','7860'); urllib.request.urlopen(f'http://127.0.0.1:{p}/health', timeout=4)"

CMD ["/app/entrypoint.sh"]
