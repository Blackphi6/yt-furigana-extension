#!/usr/bin/env python3
"""Fine-tuned reranker を ONNX に書き出し、読みAPI用 deploy バンドルへコピーする。"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def export_onnx(model_dir: Path, out_dir: Path) -> Path:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    out_dir.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
    model.eval()

    sample = tokenizer(
        "辛いラーメンを食べた [SEP] 辛い [SEP] からい",
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=128,
    )
    onnx_path = out_dir / "model.onnx"
    # dynamo=True は onnxruntime と相性が悪いので legacy exporter を使う
    torch.onnx.export(
        model,
        (sample["input_ids"], sample["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch"},
            "attention_mask": {0: "batch"},
            "logits": {0: "batch"},
        },
        opset_version=17,
        dynamo=False,
    )
    tokenizer.save_pretrained(str(out_dir))
    return onnx_path


def quantize_int8(src: Path, dest: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    try:
        quantize_dynamic(
            str(src),
            str(dest),
            weight_type=QuantType.QUInt8,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"WARN int8 quantize skipped: {exc}")


def copy_deploy_bundle(model_dir: Path, onnx_dir: Path, deploy_dir: Path) -> None:
    """Render 用は INT8 + tokenizer のみ（FP32 はローカル artifacts に残す）。"""
    deploy_dir.mkdir(parents=True, exist_ok=True)
    deploy_onnx = deploy_dir / "onnx"
    if deploy_onnx.exists():
        shutil.rmtree(deploy_onnx)
    deploy_onnx.mkdir(parents=True, exist_ok=True)
    keep = (
        "model.int8.onnx",
        "model.onnx",  # int8 が無いときのフォールバック
        "tokenizer.json",
        "tokenizer_config.json",
        "tokenizer.model",
        "special_tokens_map.json",
    )
    for name in keep:
        src = onnx_dir / name
        if not src.exists():
            continue
        # FP32 は大きいので、int8 があるときはコピーしない
        if name == "model.onnx" and (onnx_dir / "model.int8.onnx").exists():
            continue
        shutil.copy2(src, deploy_onnx / name)
    for name in ("train-meta.json", "config.json"):
        src = model_dir / name
        if src.exists():
            shutil.copy2(src, deploy_dir / name)
    int8 = deploy_onnx / "model.int8.onnx"
    fp32 = deploy_onnx / "model.onnx"
    meta = {
        "source_model": str(model_dir),
        "onnx_int8": str(int8) if int8.exists() else None,
        "onnx_fp32": str(fp32) if fp32.exists() else None,
        "bundle_note": "INT8-only for Docker/Render (≈35MB)",
    }
    (deploy_dir / "deploy-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=ROOT / "reading-engine" / "train" / "artifacts" / "reranker-prod",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="ONNX 出力先（既定: <model-dir>/onnx）",
    )
    parser.add_argument(
        "--deploy-dir",
        type=Path,
        default=ROOT / "reading-engine" / "data" / "reranker-deploy",
    )
    parser.add_argument("--skip-int8", action="store_true")
    parser.add_argument("--skip-deploy-copy", action="store_true")
    args = parser.parse_args()

    model_dir = args.model_dir
    if not model_dir.exists():
        raise SystemExit(f"missing model dir: {model_dir}\nRun: npm run learn:ndl-train")

    meta_path = model_dir / "train-meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if not meta.get("gate_ok"):
            raise SystemExit(f"train-meta gate_ok=false — not exporting {model_dir}")

    out_dir = args.out or (model_dir / "onnx")
    fp32 = export_onnx(model_dir, out_dir)
    print(f"Wrote {fp32} ({fp32.stat().st_size // (1024 * 1024)} MiB)")

    int8_path = out_dir / "model.int8.onnx"
    if not args.skip_int8:
        quantize_int8(fp32, int8_path)
        if int8_path.exists():
            print(f"Wrote {int8_path} ({int8_path.stat().st_size // (1024 * 1024)} MiB)")
        else:
            print("int8 model not created — deploy will use fp32 model.onnx")

    if not args.skip_deploy_copy:
        copy_deploy_bundle(model_dir, out_dir, args.deploy_dir)
        print(f"deploy bundle → {args.deploy_dir}")


if __name__ == "__main__":
    main()
