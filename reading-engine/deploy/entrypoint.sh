#!/bin/sh
set -eu
PORT="${PORT:-7860}"
exec uvicorn reading_engine.server:app --host 0.0.0.0 --port "$PORT"
