#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "reading-engine"))

from reading_engine.reranker import resolve_reranker_paths, reranker_backend, get_reranker  # noqa: E402

model_dir, onnx_path = resolve_reranker_paths()
get_reranker()
print(f"backend={reranker_backend()} model_dir={model_dir} onnx={onnx_path}")
print("test-reranker-path: ok")
