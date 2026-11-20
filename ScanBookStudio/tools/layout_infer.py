# -*- coding: utf-8 -*-
"""PP-DocLayoutV3 ONNX illustration detection (DirectML GPU / CPU fallback)."""
import argparse
import json
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image

INPUT_SIZE = 800
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

DOCLAYOUT_LABELS = [
    "abstract", "algorithm", "aside_text", "chart", "content", "display_formula",
    "doc_title", "figure_title", "footer", "footer_image", "footnote",
    "formula_number", "header", "header_image", "image", "inline_formula",
    "number", "paragraph_title", "reference", "reference_content", "seal",
    "table", "text", "vertical_text", "vision_footnote",
]


def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


class LayoutSession:
    def __init__(self, model_path: str):
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        providers = ["DmlExecutionProvider", "CPUExecutionProvider"]
        self.sess = ort.InferenceSession(model_path, sess_options=opts, providers=providers)
        meta = self.sess.get_modelmeta().custom_metadata_map
        labels = meta.get("character")
        self.labels = labels.splitlines() if labels else DOCLAYOUT_LABELS
        self.provider = (self.sess.get_providers() or ["CPUExecutionProvider"])[0]

    def detect_figures(self, image_path: str, filter_small: bool = True, conf_thres: float = 0.38):
        with Image.open(image_path) as im:
            rgb = im.convert("RGB")
            w, h = rgb.size
            sh, sw = INPUT_SIZE / h, INPUT_SIZE / w
            scaled = np.array(rgb.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR), dtype=np.float32) / 255.0

        x = ((scaled - MEAN) / STD).transpose(2, 0, 1)[None]
        im_shape = np.array([[INPUT_SIZE, INPUT_SIZE]], dtype=np.float32)
        scale_factor = np.array([[sh, sw]], dtype=np.float32)
        outs = self.sess.run(None, {
            "image": x,
            "im_shape": im_shape,
            "scale_factor": scale_factor,
        })
        raw = outs[0]

        allowed = {"image", "chart"}
        if not filter_small:
            allowed.update({"header_image", "footer_image"})

        cands = []
        for row in raw:
            cls_id = int(row[0])
            score = float(row[1])
            if score < conf_thres or cls_id < 0 or cls_id >= len(self.labels):
                continue
            label = self.labels[cls_id]
            if label not in allowed:
                continue
            nx1 = max(0.0, min(1.0, float(row[2]) / w))
            ny1 = max(0.0, min(1.0, float(row[3]) / h))
            nx2 = max(0.0, min(1.0, float(row[4]) / w))
            ny2 = max(0.0, min(1.0, float(row[5]) / h))
            bw = nx2 - nx1
            bh = ny2 - ny1
            area = bw * bh
            if bw < 0.03 or bh < 0.03:
                continue
            if filter_small:
                if area < 0.012:
                    continue
                if (ny2 < 0.09 or ny1 > 0.91) and bh < 0.08:
                    continue
            else:
                if area < 0.0025:
                    continue
            cands.append((score, [nx1, ny1, nx2, ny2]))

        cands.sort(key=lambda t: -t[0])
        kept = []
        for _, box in cands:
            if all(iou(box, k) < 0.55 for k in kept):
                kept.append([round(v, 5) for v in box])
        return kept

    def detect_crop_split(self, image_path: str, rotation: int = 0, conf_thres: float = 0.35):
        with Image.open(image_path) as im:
            rgb = im.convert("RGB")
            rot = ((rotation % 360) + 360) % 360
            if rot == 90:
                rgb = rgb.transpose(Image.ROTATE_270)
            elif rot == 180:
                rgb = rgb.transpose(Image.ROTATE_180)
            elif rot == 270:
                rgb = rgb.transpose(Image.ROTATE_90)
            w, h = rgb.size
            sh, sw = INPUT_SIZE / h, INPUT_SIZE / w
            scaled = np.array(rgb.resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR), dtype=np.float32) / 255.0

        x = ((scaled - MEAN) / STD).transpose(2, 0, 1)[None]
        im_shape = np.array([[INPUT_SIZE, INPUT_SIZE]], dtype=np.float32)
        scale_factor = np.array([[sh, sw]], dtype=np.float32)
        outs = self.sess.run(None, {
            "image": x,
            "im_shape": im_shape,
            "scale_factor": scale_factor,
        })
        raw = outs[0]

        content_labels = {
            "text", "doc_title", "paragraph_title", "abstract", "content",
            "image", "chart", "table", "footnote", "vision_footnote",
            "figure_title", "number", "reference", "reference_content",
            "display_formula", "algorithm", "aside_text",
        }
        boxes = []
        for row in raw:
            cls_id = int(row[0])
            score = float(row[1])
            if score < conf_thres or cls_id < 0 or cls_id >= len(self.labels):
                continue
            if self.labels[cls_id] not in content_labels:
                continue
            nx1 = max(0.0, min(1.0, float(row[2]) / w))
            ny1 = max(0.0, min(1.0, float(row[3]) / h))
            nx2 = max(0.0, min(1.0, float(row[4]) / w))
            ny2 = max(0.0, min(1.0, float(row[5]) / h))
            if (nx2 - nx1) > 0.01 and (ny2 - ny1) > 0.01:
                boxes.append((nx1, ny1, nx2, ny2))

        if not boxes:
            return {"crop_box": None, "split_mode": None, "split_ratio": None}

        # Union crop box with 2.5% padding
        ux1 = max(0.0, min(b[0] for b in boxes) - 0.025)
        uy1 = max(0.0, min(b[1] for b in boxes) - 0.025)
        ux2 = min(1.0, max(b[2] for b in boxes) + 0.025)
        uy2 = min(1.0, max(b[3] for b in boxes) + 0.025)
        crop_box = [round(ux1, 4), round(uy1, 4), round(ux2, 4), round(uy2, 4)]

        # Find best vertical gutter in [0.35, 0.65] separating left & right page boxes
        best_g = None
        best_score = -1.0
        for step in range(35, 66):
            g = step / 100.0
            left_boxes = [b for b in boxes if b[2] <= g + 0.025]
            right_boxes = [b for b in boxes if b[0] >= g - 0.025]
            crossing = [b for b in boxes if b[0] < g - 0.025 and b[2] > g + 0.025]
            if len(left_boxes) >= 2 and len(right_boxes) >= 2 and len(crossing) <= 1 and (len(left_boxes) + len(right_boxes)) >= len(crossing) * 4:
                left_edge = max(b[2] for b in left_boxes)
                right_edge = min(b[0] for b in right_boxes)
                gap_w = right_edge - left_edge
                balance = min(len(left_boxes), len(right_boxes)) / max(len(left_boxes), len(right_boxes))
                sc = gap_w * 2.0 + balance * 0.1 - len(crossing) * 0.15 - abs(g - 0.5) * 0.2
                if sc > best_score:
                    best_score = sc
                    best_g = (left_edge + right_edge) * 0.5 if right_edge >= left_edge else g

        if best_g is not None:
            return {
                "crop_box": crop_box,
                "split_mode": "double_ltr",
                "split_ratio": round(max(0.35, min(0.65, best_g)), 4),
            }
        # Only declare single-page if multiple boxes genuinely span across the center
        center_spanning = [b for b in boxes if b[0] < 0.40 and b[2] > 0.60]
        if len(center_spanning) >= 2:
            return {"crop_box": crop_box, "split_mode": "none", "split_ratio": 0.5}
        return {"crop_box": crop_box, "split_mode": None, "split_ratio": None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--task", default="figures", choices=["figures", "crop_split"])
    ap.add_argument("--input")
    ap.add_argument("--out_json")
    ap.add_argument("--filter_small", type=int, default=1)
    ap.add_argument("--rotation", type=int, default=0)
    ap.add_argument("--batch_json")
    args = ap.parse_args()

    ls = LayoutSession(args.model)
    if args.batch_json:
        tasks = json.loads(Path(args.batch_json).read_text(encoding="utf-8"))
        results = {}
        for t in tasks:
            if args.task == "crop_split":
                results[t["key"]] = ls.detect_crop_split(t["image_path"], rotation=int(t.get("rotation", 0)))
            else:
                results[t["key"]] = ls.detect_figures(t["image_path"], filter_small=bool(t.get("filter_small", 1)))
        Path(args.out_json).write_text(
            json.dumps({"provider": ls.provider, "results": results}, ensure_ascii=False),
            encoding="utf-8",
        )
    else:
        if args.task == "crop_split":
            res = ls.detect_crop_split(args.input, rotation=args.rotation)
            Path(args.out_json).write_text(
                json.dumps({"provider": ls.provider, **res}, ensure_ascii=False),
                encoding="utf-8",
            )
        else:
            boxes = ls.detect_figures(args.input, filter_small=bool(args.filter_small))
            Path(args.out_json).write_text(
                json.dumps({"provider": ls.provider, "boxes": boxes}, ensure_ascii=False),
                encoding="utf-8",
            )


if __name__ == "__main__":
    main()
