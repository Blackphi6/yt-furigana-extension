# Build from repository root:
#   docker build -f reading-engine/deploy/Dockerfile -t yt-furigana-readings .
# Hugging Face Spaces: SDK Docker, app_port 7860
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
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

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/health', timeout=4)"

CMD ["uvicorn", "reading_engine.server:app", "--host", "0.0.0.0", "--port", "7860"]
