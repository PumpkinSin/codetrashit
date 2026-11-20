import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
import onnxruntime as ort

MODEL_W = 496
MODEL_H = 720


def prepare_input(input_path: str, crop_str: str, split_mode: str, split_ratio: float, split_side: str, rotation: int):
    img = Image.open(input_path).convert("RGB")
    rot = ((rotation % 360) + 360) % 360
    if rot == 90:
        img = img.transpose(Image.Transpose.ROTATE_270)
    elif rot == 180:
        img = img.transpose(Image.Transpose.ROTATE_180)
    elif rot == 270:
        img = img.transpose(Image.Transpose.ROTATE_90)

    l, t, r, b = [float(x) for x in crop_str.split(",")]
    w, h = img.size
    x0, y0 = int(max(0.0, min(0.95, l)) * w), int(max(0.0, min(0.95, t)) * h)
    x1, y1 = int(max(l + 0.05, min(1.0, r)) * w), int(max(t + 0.05, min(1.0, b)) * h)
    if x0 > 0 or y0 > 0 or x1 < w or y1 < h:
        img = img.crop((x0, y0, max(x0 + 1, x1), max(y0 + 1, y1)))

    w, h = img.size
    if split_mode in ("double_ltr", "double_rtl"):
        crop_w = max(0.05, r - l)
        local_ratio = max(0.1, min(0.9, (split_ratio - l) / crop_w))
        sx = int(w * local_ratio)
        take_left = (split_mode == "double_ltr" and split_side == "left") or (
            split_mode == "double_rtl" and split_side == "right"
        )
        img = img.crop((0, 0, max(1, sx), h)) if take_left else img.crop((sx, 0, w, h))

    resized = img.resize((MODEL_W, MODEL_H), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    return np.transpose(arr, (2, 0, 1))[None, ...]  # (1, 3, 720, 496)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input")
    ap.add_argument("--model", required=True)
    ap.add_argument("--out_grid")
    ap.add_argument("--crop", default="0,0,1,1")
    ap.add_argument("--split_mode", default="none")
    ap.add_argument("--split_ratio", type=float, default=0.5)
    ap.add_argument("--split_side", default="left")
    ap.add_argument("--rotation", type=int, default=0)
    ap.add_argument("--batch_json")
    ap.add_argument("--out_json")
    args = ap.parse_args()

    avail = ort.get_available_providers()
    providers = [p for p in ("DmlExecutionProvider", "CPUExecutionProvider") if p in avail] or ["CPUExecutionProvider"]
    sess = ort.InferenceSession(args.model, providers=providers)
    inp_name = sess.get_inputs()[0].name

    if args.batch_json:
        tasks = json.loads(Path(args.batch_json).read_text(encoding="utf-8"))
        results = {}
        for t in tasks:
            arr = prepare_input(
                t["input"],
                t.get("crop", "0,0,1,1"),
                t.get("split_mode", "none"),
                float(t.get("split_ratio", 0.5)),
                t.get("split_side", "left"),
                int(t.get("rotation", 0)),
            )
            out = sess.run(None, {inp_name: arr})[0]
            grid_hw2 = np.transpose(out[0], (1, 2, 0))
            results[t["key"]] = grid_hw2.reshape(-1).tolist()
        Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_json).write_text(
            json.dumps({"gw": 31, "gh": 45, "provider": providers[0], "results": results}),
            encoding="utf-8",
        )
    else:
        arr = prepare_input(args.input, args.crop, args.split_mode, args.split_ratio, args.split_side, args.rotation)
        out = sess.run(None, {inp_name: arr})[0]
        grid_hw2 = np.transpose(out[0], (1, 2, 0))
        flat = grid_hw2.reshape(-1).tolist()
        Path(args.out_grid).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out_grid).write_text(
            json.dumps({"gw": 31, "gh": 45, "provider": providers[0], "grid": flat}),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
