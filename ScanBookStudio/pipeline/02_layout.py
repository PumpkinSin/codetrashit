# -*- coding: utf-8 -*-
"""阶段 2:版面分析——PP-DocLayoutV3 ONNX(DirectML),产出区块 JSON 与裁剪图。"""
import argparse
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from common import DOCLAYOUT_LABELS, PP_DOCLAYOUT_ONNX, ROOT, get_logger, load_json, save_json, TYPE_TASK

log = get_logger("02_layout")

INPUT_SIZE = 800
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class DocLayout:
    def __init__(self, model_path: Path, use_dml: bool = True):
        providers = ["CPUExecutionProvider"]
        if use_dml:
            providers = ["DmlExecutionProvider", "CPUExecutionProvider"]
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.sess = ort.InferenceSession(str(model_path), sess_options=opts, providers=providers)
        log.info("版面模型加载完成,providers=%s", self.sess.get_providers())
        meta = self.sess.get_modelmeta().custom_metadata_map
        labels = meta.get("character")
        self.labels = labels.splitlines() if labels else DOCLAYOUT_LABELS
        log.info("标签数:%d", len(self.labels))

    def preprocess(self, img: np.ndarray):
        """img: RGB uint8 HWC。返回模型输入与 scale_factor。"""
        h, w = img.shape[:2]
        sh, sw = INPUT_SIZE / h, INPUT_SIZE / w
        scaled = np.array(Image.fromarray(img).resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR))
        x = scaled.astype(np.float32) / 255.0
        x = (x - MEAN) / STD
        x = x.transpose(2, 0, 1)[None]  # 1,3,800,800
        im_shape = np.array([[INPUT_SIZE, INPUT_SIZE]], dtype=np.float32)
        scale_factor = np.array([[sh, sw]], dtype=np.float32)
        return x, im_shape, scale_factor

    def run(self, img: np.ndarray):
        x, im_shape, scale_factor = self.preprocess(img)
        outs = self.sess.run(None, {
            "image": x, "im_shape": im_shape, "scale_factor": scale_factor})
        return outs


def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def decode_detections(raw0, n_classes: int, conf_thres: float):
    """fetch_name_0 (300,7) -> 区块列表。
    列:0=类别,1=置信度,2-5=原图坐标框,6=阅读顺序号(校准确认)。"""
    boxes = []
    for row in raw0:
        cls_id, score = int(row[0]), float(row[1])
        x1, y1, x2, y2 = row[2], row[3], row[4], row[5]
        order = float(row[6])
        if score < conf_thres or cls_id < 0 or cls_id >= n_classes:
            continue
        boxes.append({"type": cls_id, "score": score, "bbox": [x1, y1, x2, y2],
                      "order": order})
    # IoU 去重:同区域重复检出保留高分者
    boxes.sort(key=lambda b: -b["score"])
    kept = []
    for b in boxes:
        if all(iou(b["bbox"], k["bbox"]) < 0.6 for k in kept):
            kept.append(b)
    return kept


def geometric_order(boxes, page_w, page_h):
    """几何阅读顺序兜底:按双栏/单栏分块,列内自上而下。"""
    if not boxes:
        return []
    items = list(enumerate(boxes))
    # 列聚类:按中心 x 与页宽比例分两栏(存在明显的左右分界时)
    centers = sorted((b["bbox"][0] + b["bbox"][2]) / 2 for _, b in items)

    def full_width(b):
        return (b["bbox"][2] - b["bbox"][0]) > page_w * 0.6

    fulls = [(i, b) for i, b in items if full_width(b)]
    halves = [(i, b) for i, b in items if not full_width(b)]
    order = []
    if halves:
        mid = page_w / 2
        left = sorted([(i, b) for i, b in halves if (b["bbox"][0] + b["bbox"][2]) / 2 <= mid],
                      key=lambda t: t[1]["bbox"][1])
        right = sorted([(i, b) for i, b in halves if (b["bbox"][0] + b["bbox"][2]) / 2 > mid],
                       key=lambda t: t[1]["bbox"][1])
        # 全宽块作为分界插入:先顶部全宽,再左右栏,再底部全宽
        tops = sorted([(i, b) for i, b in fulls if b["bbox"][1] < min(b["bbox"][1] for _, b in halves)],
                      key=lambda t: t[1]["bbox"][1])
        bots = sorted([(i, b) for i, b in fulls if i not in {j for j, _ in tops}],
                      key=lambda t: t[1]["bbox"][1])
        order = [j for j, _ in tops] + [j for j, _ in left] + [j for j, _ in right] + [j for j, _ in bots]
    else:
        order = [i for i, _ in sorted(items, key=lambda t: (t[1]["bbox"][1], t[1]["bbox"][0]))]
    seen, result = set(), []
    for i in order:
        if i not in seen:
            seen.add(i)
            result.append(i)
    for i, _ in items:  # 兜底:漏掉的补上
        if i not in seen:
            result.append(i)
    return result


def main(work: Path, conf: float = 0.5, debug: bool = False, only_pages=None):
    import pymupdf  # noqa: F401  (确保 PIL/numpy 环境一致)
    manifest = load_json(work / "manifest.json")
    engine = DocLayout(PP_DOCLAYOUT_ONNX)

    scan_pages = [p for p in manifest["pages"] if p["type"] == "scan"
                  and (only_pages is None or p["n"] in only_pages)]
    t0 = time.time()
    for p in scan_pages:
        img_path = work / p["png"]
        img = np.array(Image.open(img_path).convert("RGB"))
        h, w = img.shape[:2]
        outs = engine.run(img)
        if debug:
            log.info("page %d outputs: %s", p["n"], [np.asarray(o).shape for o in outs])
        raw0 = np.asarray(outs[0])          # (300, 7): cls, score, x1,y1,x2,y2, order?
        if debug:
            for r in raw0:
                if r[1] >= conf:
                    log.info("det: cls=%d(%.10s) score=%.3f box=(%.0f,%.0f,%.0f,%.0f) col6=%.1f",
                             int(r[0]), engine.labels[int(r[0])] if int(r[0]) < len(engine.labels) else "?",
                             r[1], r[2], r[3], r[4], r[5], r[6])
            if len(outs) > 2:
                raw2 = np.asarray(outs[2])
                log.info("raw2 shape=%s stats: min=%.3f max=%.3f",
                         raw2.shape, raw2.min(), raw2.max())
        boxes = decode_detections(raw0, len(engine.labels), conf)
        crops_dir = work / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)
        for b in boxes:
            b["type_name"] = engine.labels[b["type"]] if b["type"] < len(engine.labels) else "?"
            x1, y1, x2, y2 = b["bbox"]
            x1, x2 = max(0, min(x1, w)), max(0, min(x2, w))
            y1, y2 = max(0, min(y1, h)), max(0, min(y2, h))
            b["bbox"] = [int(x1), int(y1), int(x2), int(y2)]
        # 阅读顺序:优先模型顺序号(col6),缺省时用几何兜底
        if boxes and all("order" in b for b in boxes):
            order = [i for i, _ in sorted(enumerate(boxes), key=lambda t: t[1]["order"])]
        else:
            order = geometric_order(boxes, w, h)
        # 裁剪
        for k, b in enumerate(boxes):
            x1, y1, x2, y2 = b["bbox"]
            crop = Image.fromarray(img[y1:y2, x1:x2])
            crop_path = crops_dir / f"p{p['n']:04d}_b{k:02d}_{b['type_name']}.png"
            crop.save(crop_path)
            b["crop"] = str(crop_path.relative_to(work))
        result = {
            "n": p["n"], "w": w, "h": h,
            "blocks": boxes,
            "order": order,
            "layout_ms": round((time.time() - t0) * 1000, 1),
        }
        save_json(work / "blocks" / f"p{p['n']:04d}.json", result)
        log.info("page %d:%d 个区块(模型顺序 %s)", p["n"], len(boxes), order[:8])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--conf", type=float, default=0.5)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--pages", default=None, help="仅处理这些页,如 3,4")
    args = ap.parse_args()
    pages = [int(x) for x in args.pages.split(",")] if args.pages else None
    main(ROOT / args.work, conf=args.conf, debug=args.debug, only_pages=pages)
