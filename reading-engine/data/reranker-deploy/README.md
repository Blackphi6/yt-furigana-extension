# reranker-deploy

`npm run learn:ndl-export-onnx` が生成する **読みAPI用** ModernBERT-Ja 30M reranker バンドル。

- `onnx/model.int8.onnx` — 推論用（約 35MB）
- `onnx/tokenizer.json` — SentencePiece
- `train-meta.json` — holdout / seed ゲート結果

Docker / Render は **INT8 のみ**同梱（FP32 は `train/artifacts/reranker-prod/onnx/` に残す）。
`render.yaml` の `YT_FURIGANA_RERANKER_PATH` がこのディレクトリを指します。
