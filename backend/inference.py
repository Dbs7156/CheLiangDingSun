"""Image/video decoding, ONNX inference, demo data and video tracking."""

from __future__ import annotations

import ast
import hashlib
import io
import json
import logging
import math
import random
import threading
import time
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None

try:
    import onnxruntime as ort
except ImportError:  # pragma: no cover
    ort = None


class InputMediaError(ValueError):
    """An upload problem that can be shown directly to the user."""


DEFAULT_CLASSES = [
    {"id": 0, "key": "dent", "name": "凹陷", "color": "#2563eb"},
    {"id": 1, "key": "scratch", "name": "划痕", "color": "#0d9488"},
    {"id": 2, "key": "crack", "name": "裂纹", "color": "#ea580c"},
    {"id": 3, "key": "glass_shatter", "name": "玻璃破损", "color": "#7c3aed"},
    {"id": 4, "key": "lamp_broken", "name": "车灯破损", "color": "#d97706"},
    {"id": 5, "key": "tire_flat", "name": "轮胎破损", "color": "#e11d48"},
]

DEFAULT_PALETTE = [
    "#2563eb",
    "#0d9488",
    "#ea580c",
    "#7c3aed",
    "#d97706",
    "#e11d48",
    "#0891b2",
    "#65a30d",
    "#c026d3",
    "#4f46e5",
]

DEMO_NOTICE = (
    "当前为演示模式：检测框与置信度由模拟数据生成，"
    "不代表真实模型推理结果，不可作为定损依据。"
)


# =========================================================
# Class configuration
# =========================================================


def load_classes(path: str | Path) -> tuple[list[dict], bool]:
    """Load classes.json. Return (classes, used_default_classes)."""

    config_path = Path(path)
    if not config_path.exists():
        return [dict(item) for item in DEFAULT_CLASSES], True

    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"类别配置读取失败：{exc}") from exc

    entries = raw.get("classes") if isinstance(raw, dict) else raw
    if not isinstance(entries, list) or not entries:
        raise ValueError("classes.json 必须是非空数组，或包含 classes 数组的对象。")

    classes = []
    used_keys = set()
    for index, entry in enumerate(entries):
        if isinstance(entry, str):
            name = entry.strip()
            key = f"class_{index}"
            color = DEFAULT_PALETTE[index % len(DEFAULT_PALETTE)]
        elif isinstance(entry, dict):
            name = str(
                entry.get("name")
                or entry.get("name_zh")
                or entry.get("zh")
                or entry.get("label")
                or ""
            ).strip()
            if not name:
                raise ValueError(f"第 {index + 1} 个类别缺少 name 字段。")
            key = str(entry.get("key") or entry.get("slug") or f"class_{index}").strip()
            key = "".join(char if char.isalnum() or char in "_-" else "_" for char in key).lower()
            color = str(entry.get("color") or "").strip()
            if not (color.startswith("#") and len(color) == 7):
                color = DEFAULT_PALETTE[index % len(DEFAULT_PALETTE)]
        else:
            raise ValueError(f"第 {index + 1} 个类别格式无效。")

        base_key = key or f"class_{index}"
        key = base_key
        suffix = 2
        while key in used_keys:
            key = f"{base_key}_{suffix}"
            suffix += 1
        used_keys.add(key)

        classes.append({"id": index, "key": key, "name": name, "color": color})

    return classes, False


def classes_by_id(classes: list[dict]) -> dict[int, dict]:
    return {item["id"]: item for item in classes}


# =========================================================
# Image / thumbnail helpers
# =========================================================


def _thumbnail_jpeg(image: Image.Image, max_width: int) -> bytes:
    image = image.copy()
    if image.mode == "RGBA":
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")

    width, height = image.size
    if width > max_width:
        image = image.resize(
            (max_width, max(1, int(round(height * max_width / width)))),
            Image.Resampling.LANCZOS,
        )
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=82, optimize=True)
    return buffer.getvalue()


def decode_image(payload: bytes, max_pixels: int, thumbnail_width: int = 720):
    try:
        with Image.open(io.BytesIO(payload)) as opened:
            opened.load()
            image = ImageOps.exif_transpose(opened)
            if image.width * image.height > max_pixels:
                raise InputMediaError(
                    f"图片尺寸过大，请压缩到 {max_pixels // 1_000_000} 百万像素以内。"
                )
            if image.mode in {"RGBA", "LA", "P"}:
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, (255, 255, 255))
                background.paste(rgba, mask=rgba.getchannel("A"))
                image = background
            elif image.mode != "RGB":
                image = image.convert("RGB")
            thumbnail = _thumbnail_jpeg(image, thumbnail_width)
            rgb = np.asarray(image, dtype=np.uint8)
    except InputMediaError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InputMediaError(
            "图片无法解码，请上传 JPG、PNG 或 WebP 格式的有效图片。"
        ) from exc

    if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.shape[0] < 2 or rgb.shape[1] < 2:
        raise InputMediaError("图片内容为空或尺寸无效。")
    return rgb, rgb.shape[1], rgb.shape[0], thumbnail


def _hex_rgba(value: str, alpha: int = 60) -> tuple[int, int, int, int]:
    try:
        value = value.lstrip("#")
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)
    except (ValueError, TypeError):
        return (37, 99, 235, alpha)


def annotate_thumbnail(thumbnail_jpeg: bytes, detections: list[dict]) -> bytes:
    """Draw simple class-coloured boxes onto a history thumbnail."""

    if not detections:
        return thumbnail_jpeg
    try:
        with Image.open(io.BytesIO(thumbnail_jpeg)) as opened:
            image = opened.convert("RGB")
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        width, height = image.size
        line_width = max(2, int(round(width * 0.0028)))

        for item in detections[:12]:
            bbox = item.get("bbox") or {}
            try:
                x = float(bbox["x"])
                y = float(bbox["y"])
                w = float(bbox["w"])
                h = float(bbox["h"])
            except (KeyError, TypeError, ValueError):
                continue
            x1 = int(round(max(0.0, min(1.0, x)) * width))
            y1 = int(round(max(0.0, min(1.0, y)) * height))
            x2 = int(round(max(0.0, min(1.0, x + w)) * width))
            y2 = int(round(max(0.0, min(1.0, y + h)) * height))
            if x2 - x1 < 2 or y2 - y1 < 2:
                continue
            color = str(item.get("color") or "#2563eb")
            draw.rectangle(
                (x1, y1, x2, y2),
                fill=_hex_rgba(color, 48),
                outline=_hex_rgba(color, 255),
                width=line_width,
            )
            tag_width = min(max(14, int(round(width * 0.08))), max(14, x2 - x1))
            draw.rectangle(
                (x1, max(0, y1 - line_width * 3), x1 + tag_width, y1),
                fill=_hex_rgba(color, 245),
            )
        composed = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
        buffer = io.BytesIO()
        composed.save(buffer, format="JPEG", quality=82, optimize=True)
        return buffer.getvalue()
    except Exception:  # noqa: BLE001
        logger.warning("绘制检测缩略图失败", exc_info=True)
        return thumbnail_jpeg


# =========================================================
# Video helpers
# =========================================================


def probe_video(path: str | Path, max_seconds: int, thumbnail_width: int = 720):
    if cv2 is None:
        raise RuntimeError("未安装 opencv-python-headless，无法处理视频。")
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        raise InputMediaError("无法解析该视频。请使用 MP4（H.264）或 WebM 格式。")
    try:
        if hasattr(cv2, "CAP_PROP_ORIENTATION_AUTO"):
            capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, frame = capture.read()
        if not ok or frame is None:
            raise InputMediaError("无法读取视频画面，请重新导出视频后重试。")
        height, width = frame.shape[:2]
        if width < 2 or height < 2:
            raise InputMediaError("视频画面尺寸无效。")
        if not math.isfinite(fps) or fps <= 0 or fps > 240:
            if frame_count > 0:
                fps = 25.0
            else:
                raise InputMediaError("无法读取视频帧率，请转换视频格式后重试。")
        if frame_count <= 0:
            raise InputMediaError("无法读取视频时长，请重新导出视频后重试。")
        duration = frame_count / fps
        if not math.isfinite(duration) or duration <= 0.05:
            raise InputMediaError("视频时长无效或过短。")
        if duration > max_seconds + 1:
            raise InputMediaError(f"视频时长不能超过 {max_seconds} 秒，请剪辑后重试。")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        thumbnail = _thumbnail_jpeg(Image.fromarray(rgb), thumbnail_width)
        metadata = {
            "width": width,
            "height": height,
            "duration": round(duration, 3),
            "fps": round(float(fps), 3),
            "frame_count": frame_count,
        }
        return metadata, thumbnail
    finally:
        capture.release()


def effective_sample_fps(fps: float, target: float) -> float:
    safe_fps = max(fps, 0.1)
    target = max(0.5, min(target, 30.0))
    step = max(1, int(round(safe_fps / target)))
    return safe_fps / step


def process_video_keyframes(
    path: str | Path,
    metadata: dict,
    sample_fps: float,
    detect_fn: Callable[[np.ndarray, float], list[dict]],
    progress_fn: Callable[[int], None],
):
    if cv2 is None:
        raise RuntimeError("未安装 opencv-python-headless，无法处理视频。")
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        raise InputMediaError("无法重新打开上传的视频，请重试。")
    if hasattr(cv2, "CAP_PROP_ORIENTATION_AUTO"):
        capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)

    fps = max(float(metadata["fps"]), 0.1)
    step = max(1, int(round(fps / max(0.5, min(sample_fps, 10.0)))))
    total_frames = max(1, int(metadata["frame_count"]))
    results = []
    processed = 0
    frame_index = 0
    last_reported = -1
    try:
        while True:
            if not capture.grab():
                break
            if frame_index % step == 0:
                retrieved, frame = capture.retrieve()
                if retrieved and frame is not None:
                    timestamp = min(float(metadata["duration"]), frame_index / fps)
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results.append((round(timestamp, 3), detect_fn(rgb, timestamp)))
                    processed += 1
            frame_index += 1
            progress = min(98, int((frame_index / total_frames) * 100))
            if progress != last_reported:
                progress_fn(progress)
                last_reported = progress
        if not results:
            raise InputMediaError("未能从视频中提取可分析画面，请更换视频后重试。")
        progress_fn(98)
        return results, processed
    finally:
        capture.release()


# =========================================================
# YOLO ONNX post-processing
# =========================================================


def _resize_rgb(image: np.ndarray, width: int, height: int) -> np.ndarray:
    if cv2 is not None:
        return cv2.resize(image, (width, height), interpolation=cv2.INTER_LINEAR)
    return np.asarray(Image.fromarray(image).resize((width, height), Image.Resampling.BILINEAR))


def _letterbox(image: np.ndarray, input_width: int, input_height: int):
    height, width = image.shape[:2]
    scale = min(input_width / width, input_height / height)
    resized_width = max(1, int(round(width * scale)))
    resized_height = max(1, int(round(height * scale)))
    resized = _resize_rgb(image, resized_width, resized_height)
    pad_x = (input_width - resized_width) / 2.0
    pad_y = (input_height - resized_height) / 2.0
    canvas = np.full((input_height, input_width, 3), 114, dtype=np.uint8)
    left = int(round(pad_x))
    top = int(round(pad_y))
    canvas[top:top + resized_height, left:left + resized_width] = resized
    return canvas, scale, pad_x, pad_y


def _nms(boxes, scores, class_ids, iou_threshold: float, max_detections: int) -> list[int]:
    if len(boxes) == 0:
        return []
    order = np.argsort(scores)[::-1][: max(max_detections * 12, 200)]
    keep = []
    while order.size > 0 and len(keep) < max_detections:
        index = int(order[0])
        keep.append(index)
        if order.size == 1:
            break
        rest = order[1:]
        current = boxes[index]
        candidates = boxes[rest]
        xx1 = np.maximum(current[0], candidates[:, 0])
        yy1 = np.maximum(current[1], candidates[:, 1])
        xx2 = np.minimum(current[2], candidates[:, 2])
        yy2 = np.minimum(current[3], candidates[:, 3])
        intersection = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        area_current = max(0.0, float((current[2] - current[0]) * (current[3] - current[1])))
        area_candidates = np.maximum(0.0, (candidates[:, 2] - candidates[:, 0]) * (candidates[:, 3] - candidates[:, 1]))
        union = area_current + area_candidates - intersection
        iou = np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 1e-9)
        suppress = (class_ids[rest] == class_ids[index]) & (iou > iou_threshold)
        order = rest[~suppress]
    return keep


def _candidate_matrix(outputs, class_count: int):
    candidates = []
    for raw_output in outputs:
        array = np.squeeze(np.asarray(raw_output))
        if array.ndim == 2 and array.size:
            candidates.append(array)
    if not candidates:
        return None
    feature_counts = {4 + class_count, 5 + class_count}
    if class_count != 2:
        feature_counts.add(6)
    for array in candidates:
        rows, cols = array.shape
        row_match = rows in feature_counts
        col_match = cols in feature_counts
        if row_match and not col_match:
            return array.T.astype(np.float32, copy=False)
        if col_match and not row_match:
            return array.astype(np.float32, copy=False)
        if cols == 6 and rows != 6:
            return array.astype(np.float32, copy=False)
        if rows == 6 and cols != 6:
            return array.T.astype(np.float32, copy=False)
    for array in candidates:
        if array.shape[0] in feature_counts:
            return array.T.astype(np.float32, copy=False)
        if array.shape[1] in feature_counts:
            return array.astype(np.float32, copy=False)
    return None


def _raw_boxes_to_xyxy(raw_boxes, box_format, input_width, input_height):
    normalized = bool(
        np.isfinite(raw_boxes).all()
        and float(np.nanmax(raw_boxes)) <= 2.0
        and float(np.nanmin(raw_boxes)) >= -0.5
    )
    chosen = box_format if box_format != "auto" else "cxcywh"
    if chosen in {"cxcywh", "xywh", "center"}:
        cx = raw_boxes[:, 0].copy()
        cy = raw_boxes[:, 1].copy()
        width = raw_boxes[:, 2].copy()
        height = raw_boxes[:, 3].copy()
        if normalized:
            cx *= input_width
            width *= input_width
            cy *= input_height
            height *= input_height
        boxes = np.stack([cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2], axis=1)
    elif chosen in {"xyxy", "corners"}:
        boxes = raw_boxes.copy()
        if normalized:
            boxes[:, [0, 2]] *= input_width
            boxes[:, [1, 3]] *= input_height
    else:
        raise ValueError("MODEL_BOX_FORMAT 必须为 auto、cxcywh 或 xyxy。")
    return boxes


def decode_predictions(
    outputs,
    class_count,
    original_width,
    original_height,
    input_width,
    input_height,
    scale,
    pad_x,
    pad_y,
    confidence_threshold,
    iou_threshold,
    output_format="auto",
    box_format="auto",
    max_detections=100,
):
    matrix = _candidate_matrix(outputs, class_count)
    if matrix is None:
        shapes = [tuple(np.asarray(item).shape) for item in outputs]
        raise ValueError(f"无法识别模型输出结构：{shapes}")
    rows, cols = matrix.shape
    chosen_format = output_format
    if chosen_format == "auto":
        if cols == 6 and 4 + class_count != 6:
            chosen_format = "end2end"
        elif cols == 4 + class_count:
            chosen_format = "yolov8"
        elif cols == 5 + class_count:
            chosen_format = "yolov5"
        elif cols == 6:
            last_column = matrix[:, 5]
            rounded = np.rint(last_column)
            if np.all(np.abs(last_column - rounded) < 1e-3) and np.all((rounded >= 0) & (rounded < class_count)):
                chosen_format = "end2end"
            else:
                chosen_format = "yolov8"
        else:
            raise ValueError(
                f"输出列数 {cols} 与类别数 {class_count} 不匹配，请检查 classes.json。"
            )

    if chosen_format in {"end2end", "end-to-end", "nms"}:
        boxes_xyxy = matrix[:, :4].copy()
        scores = matrix[:, 4].copy()
        class_ids = np.rint(matrix[:, 5]).astype(np.int32)
        normalized = bool(
            np.isfinite(boxes_xyxy).all()
            and float(np.nanmax(boxes_xyxy)) <= 2.0
            and float(np.nanmin(boxes_xyxy)) >= -0.5
        )
        if normalized:
            boxes_xyxy[:, [0, 2]] *= input_width
            boxes_xyxy[:, [1, 3]] *= input_height
    elif chosen_format in {"yolov8", "v8", "raw"}:
        if cols != 4 + class_count:
            raise ValueError(f"按 YOLOv8 解析需要 {4 + class_count} 列，实际 {cols} 列。")
        raw_boxes = matrix[:, :4].copy()
        class_scores = matrix[:, 4:4 + class_count]
        class_ids = np.argmax(class_scores, axis=1).astype(np.int32)
        scores = np.max(class_scores, axis=1)
        boxes_xyxy = _raw_boxes_to_xyxy(raw_boxes, box_format, input_width, input_height)
    elif chosen_format in {"yolov5", "v5"}:
        if cols != 5 + class_count:
            raise ValueError(f"按 YOLOv5 解析需要 {5 + class_count} 列，实际 {cols} 列。")
        raw_boxes = matrix[:, :4].copy()
        objectness = matrix[:, 4]
        class_scores = matrix[:, 5:5 + class_count]
        class_ids = np.argmax(class_scores, axis=1).astype(np.int32)
        scores = objectness * np.max(class_scores, axis=1)
        boxes_xyxy = _raw_boxes_to_xyxy(raw_boxes, box_format, input_width, input_height)
    else:
        raise ValueError("MODEL_OUTPUT_FORMAT 必须为 auto、yolov8、yolov5 或 end2end。")

    mask = (
        np.isfinite(scores)
        & np.isfinite(boxes_xyxy).all(axis=1)
        & (scores >= confidence_threshold)
        & (class_ids >= 0)
        & (class_ids < class_count)
    )
    scores = scores[mask]
    boxes_xyxy = boxes_xyxy[mask]
    class_ids = class_ids[mask]
    if len(scores) == 0:
        return []

    keep = _nms(boxes_xyxy, scores, class_ids, iou_threshold, max_detections)
    detections = []
    for index in keep:
        x1, y1, x2, y2 = boxes_xyxy[index]
        x1 = (x1 - pad_x) / scale
        x2 = (x2 - pad_x) / scale
        y1 = (y1 - pad_y) / scale
        y2 = (y2 - pad_y) / scale
        x1 = min(max(x1, 0.0), original_width)
        x2 = min(max(x2, 0.0), original_width)
        y1 = min(max(y1, 0.0), original_height)
        y2 = min(max(y2, 0.0), original_height)
        width = x2 - x1
        height = y2 - y1
        if width <= 1 or height <= 1:
            continue
        detections.append(
            {
                "class_id": int(class_ids[index]),
                "confidence": float(min(max(scores[index], 0.0), 1.0)),
                "x": float(x1 / original_width),
                "y": float(y1 / original_height),
                "w": float(width / original_width),
                "h": float(height / original_height),
            }
        )
    detections.sort(key=lambda item: item["confidence"], reverse=True)
    return detections[:max_detections]


# =========================================================
# ONNX model runtime
# =========================================================


class ModelEngine:
    def __init__(
        self,
        mode="auto",
        model_path=None,
        classes_path=None,
        model_name="车辆受损检测模型",
        input_size=640,
        providers=None,
        output_format="auto",
        box_format="auto",
        input_color="rgb",
        max_detections=100,
        confidence_threshold=0.35,
        iou_threshold=0.45,
    ):
        self.requested_mode = mode if mode in {"auto", "demo", "model"} else "auto"
        self.model_path = Path(model_path) if model_path else Path("best.onnx")
        self.classes_path = Path(classes_path) if classes_path else Path("classes.json")
        self.model_name = model_name or "车辆受损检测模型"
        self.configured_input_size = int(input_size)
        self.providers = providers or ["CPUExecutionProvider"]
        self.output_format = output_format
        self.box_format = box_format
        self.input_color = input_color
        self.max_detections = int(max_detections)
        self.confidence_threshold = float(confidence_threshold)
        self.iou_threshold = float(iou_threshold)
        self.session = None
        self.provider = None
        self.input_width = None
        self.input_height = None
        self.input_name = None
        self.output_names = []
        self.mode = "unavailable"
        self.ready = False
        self.message = "识别引擎尚未初始化。"
        self.classes = [dict(item) for item in DEFAULT_CLASSES]
        self.using_default_classes = True
        self._lock = threading.Lock()
        self._initialize()

    def _initialize(self):
        try:
            self.classes, self.using_default_classes = load_classes(self.classes_path)
        except ValueError as exc:
            logger.error("%s", exc)
            self.classes = [dict(item) for item in DEFAULT_CLASSES]
            self.message = f"类别配置无效：{exc}"
            self.mode = "unavailable" if self.model_path.is_file() else "demo"
            self.ready = self.mode == "demo"
            if self.mode == "demo":
                self.message = "演示模式：类别配置无效，识别结果由模拟数据生成。"
            return

        model_exists = self.model_path.is_file()
        if self.requested_mode == "demo":
            self._start_demo("已强制启用演示模式，识别结果由模拟数据生成。")
            return
        if not model_exists:
            if self.requested_mode == "model":
                self.mode = "unavailable"
                self.message = "未找到检测模型文件，且 DETECTION_MODE=model。请将 ONNX 文件放到 backend/best.onnx。"
            else:
                self._start_demo("演示模式：尚未检测到正式检测模型，当前结果由模拟数据生成。")
            return
        if self.using_default_classes:
            self.mode = "unavailable"
            self.message = "检测到 ONNX 模型，但缺少 classes.json。为避免标签错位，已停止加载模型。"
            return
        try:
            self._load_onnx()
        except Exception as exc:  # noqa: BLE001
            logger.exception("加载 ONNX 模型失败")
            self.mode = "unavailable"
            self.message = f"检测模型加载失败：{exc}"
            return
        self.mode = "model"
        self.ready = True
        self.message = "检测模型已加载，推理服务就绪。"

    def _start_demo(self, message):
        self.mode = "demo"
        self.ready = True
        self.provider = None
        self.input_width = self.configured_input_size
        self.input_height = self.configured_input_size
        self.message = message
        logger.info("车辆受损检测服务运行于演示模式")

    def _load_onnx(self):
        if ort is None:
            raise RuntimeError("未安装 onnxruntime，无法加载 ONNX 模型。")
        available = ort.get_available_providers()
        chosen = [item for item in self.providers if item in available]
        if not chosen:
            chosen = ["CPUExecutionProvider"] if "CPUExecutionProvider" in available else available
        if not chosen:
            raise RuntimeError("当前环境没有可用的 ONNX Runtime 执行提供程序。")
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.log_severity_level = 3
        self.session = ort.InferenceSession(str(self.model_path), sess_options=options, providers=chosen)
        self.provider = self.session.get_providers()[0]
        model_input = self.session.get_inputs()[0]
        self.input_name = model_input.name
        self.output_names = [item.name for item in self.session.get_outputs()]
        shape = model_input.shape
        self.input_width = self.configured_input_size
        self.input_height = self.configured_input_size
        self.input_layout = "nchw"
        if len(shape) == 4:
            if isinstance(shape[3], int) and shape[3] == 3:
                self.input_layout = "nhwc"
                if isinstance(shape[1], int) and shape[1] > 0:
                    self.input_height = int(shape[1])
                if isinstance(shape[2], int) and shape[2] > 0:
                    self.input_width = int(shape[2])
            else:
                if isinstance(shape[2], int) and shape[2] > 0:
                    self.input_height = int(shape[2])
                if isinstance(shape[3], int) and shape[3] > 0:
                    self.input_width = int(shape[3])

        metadata = self.session.get_modelmeta().custom_metadata_map
        raw_names = metadata.get("names")
        if raw_names:
            try:
                names = ast.literal_eval(raw_names)
                if isinstance(names, (dict, list, tuple)):
                    model_class_count = len(names)
                    if model_class_count != len(self.classes):
                        raise RuntimeError(
                            f"模型内置类别数 {model_class_count} 与 classes.json 的 "
                            f"{len(self.classes)} 不一致，请按模型导出顺序修改类别配置。"
                        )
            except (ValueError, SyntaxError):
                logger.warning("无法解析模型内置的类别元数据，将使用 classes.json。")

        logger.info(
            "ONNX 模型已加载：%s，输入=%sx%s，类别数=%s，提供程序=%s",
            self.model_path.name,
            self.input_width,
            self.input_height,
            len(self.classes),
            self.provider,
        )

    def status(self):
        return {
            "mode": self.mode,
            "requested_mode": self.requested_mode,
            "ready": self.ready,
            "model_name": self.model_name,
            "engine": "ONNX Runtime" if self.mode == "model" else "演示引擎",
            "classes": self.classes,
            "input_size": self.input_width or self.configured_input_size,
            "message": self.message,
            "demo": self.mode == "demo",
            "provider": self.provider,
        }

    def detect(self, image_rgb, seed=None, confidence=None, iou=None):
        if not self.ready:
            raise RuntimeError(self.message)
        confidence = self.confidence_threshold if confidence is None else confidence
        iou = self.iou_threshold if iou is None else iou

        if self.mode == "demo":
            started = time.perf_counter()
            detections = demo_image_detections(
                self.classes,
                confidence_threshold=confidence,
                seed=seed or 0,
            )
            return detections, max(0.1, (time.perf_counter() - started) * 1000)

        if self.mode != "model":
            raise RuntimeError(self.message)

        original_height, original_width = image_rgb.shape[:2]
        if self.input_color == "bgr":
            model_image = image_rgb[:, :, ::-1]
        elif self.input_color == "rgb":
            model_image = image_rgb
        else:
            raise RuntimeError("MODEL_INPUT_COLOR 必须为 rgb 或 bgr。")

        canvas, scale, pad_x, pad_y = _letterbox(
            model_image, self.input_width, self.input_height
        )
        tensor = canvas.astype(np.float32) / 255.0
        if getattr(self, "input_layout", "nchw") == "nchw":
            tensor = np.transpose(tensor, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)

        started = time.perf_counter()
        with self._lock:
            outputs = self.session.run(self.output_names, {self.input_name: tensor})
        inference_ms = (time.perf_counter() - started) * 1000
        detections = decode_predictions(
            outputs,
            len(self.classes),
            original_width,
            original_height,
            self.input_width,
            self.input_height,
            scale,
            pad_x,
            pad_y,
            confidence,
            iou,
            self.output_format,
            self.box_format,
            self.max_detections,
        )
        return detections, inference_ms


# =========================================================
# Demo data
# =========================================================

IMAGE_REGIONS = {
    "scratch": (0.29, 0.535, 0.165, 0.082),
    "dent": (0.595, 0.465, 0.115, 0.125),
    "tire_flat": (0.218, 0.682, 0.078, 0.120),
    "crack": (0.455, 0.565, 0.125, 0.085),
    "lamp_broken": (0.805, 0.535, 0.072, 0.075),
    "glass_shatter": (0.435, 0.345, 0.135, 0.075),
}

VIDEO_CLASS_ORDER = ["scratch", "dent", "tire_flat", "crack", "lamp_broken", "glass_shatter"]
VIDEO_REGIONS = [
    (0.27, 0.52, 0.16, 0.09, 0.015, 0.006),
    (0.56, 0.45, 0.12, 0.13, 0.018, 0.008),
    (0.72, 0.63, 0.09, 0.11, 0.012, 0.004),
]


def seed_from_bytes(payload: bytes) -> int:
    return int.from_bytes(hashlib.sha256(payload).digest()[:8], "big", signed=False)


def seed_from_text(text: str) -> int:
    return seed_from_bytes(text.encode("utf-8"))


def _pick_classes(classes, count):
    by_key = {item["key"]: item for item in classes}
    preferred = [by_key[key] for key in VIDEO_CLASS_ORDER if key in by_key]
    remaining = [item for item in classes if item not in preferred]
    return (preferred + remaining)[:count]


def demo_image_detections(classes, confidence_threshold=0.35, seed=0):
    if not classes:
        return []
    rng = random.Random(seed)
    selected = _pick_classes(classes, 3)
    base_confidences = [0.916, 0.854, 0.773]
    detections = []
    for index, info in enumerate(selected):
        region = IMAGE_REGIONS.get(info["key"]) or IMAGE_REGIONS["scratch"]
        jitter_x = rng.uniform(-0.015, 0.015) if index else 0.0
        jitter_y = rng.uniform(-0.012, 0.012) if index else 0.0
        x = min(max(region[0] + jitter_x, 0.01), 0.94)
        y = min(max(region[1] + jitter_y, 0.02), 0.92)
        width = min(region[2], 0.985 - x)
        height = min(region[3], 0.985 - y)
        confidence = min(0.97, base_confidences[index] + rng.uniform(-0.02, 0.022))
        if confidence < confidence_threshold:
            continue
        detections.append(
            {
                "class_id": info["id"],
                "confidence": round(confidence, 4),
                "x": x,
                "y": y,
                "w": width,
                "h": height,
            }
        )
    return sorted(detections, key=lambda item: item["confidence"], reverse=True)


def demo_video_frames(duration, classes, sample_fps, confidence_threshold, seed, width, height):
    if duration <= 0 or not classes:
        return [], [], 0
    rng = random.Random(seed)
    fps = max(0.5, min(sample_fps, 10.0))
    step = 1.0 / fps
    sample_count = max(1, int(math.ceil(duration / step)) + 1)
    selected = _pick_classes(classes, 3)
    portrait = height > width * 1.05
    landscape = width > height * 1.35
    specs = []
    for index, info in enumerate(selected):
        base_x, base_y, base_w, base_h, drift_x, drift_y = VIDEO_REGIONS[index]
        if portrait:
            base_x = [0.2, 0.35, 0.5][index]
            base_y = [0.35, 0.52, 0.67][index]
            base_w = [0.35, 0.3, 0.26][index]
            base_h = [0.09, 0.1, 0.08][index]
        elif not landscape:
            base_x = [0.2, 0.44, 0.64][index]
            base_y = [0.45, 0.36, 0.6][index]
        spec = {
            "info": info,
            "base": (base_x, base_y, base_w, base_h),
            "drift": (drift_x, drift_y),
            "phase": rng.uniform(0, math.tau),
            "speed": rng.uniform(0.35, 0.62),
            "confidence": [0.874, 0.812, 0.748][index],
            "track_id": index + 1,
            "first_seen": None,
            "last_seen": None,
            "max_confidence": 0.0,
        }
        specs.append(spec)

    frames = []
    peak_objects = 0
    for sample_index in range(sample_count):
        timestamp = min(duration, sample_index * step)
        frame_detections = []
        for spec in specs:
            info = spec["info"]
            base_x, base_y, base_w, base_h = spec["base"]
            drift_x, drift_y = spec["drift"]
            wave = math.sin(timestamp * spec["speed"] * math.tau / max(duration, 1.0) + spec["phase"])
            wave2 = math.cos(timestamp * 0.8 + spec["phase"])
            x = base_x + drift_x * wave
            y = base_y + drift_y * wave2
            x = min(max(x, 0.015), 1.0 - base_w - 0.015)
            y = min(max(y, 0.02), 1.0 - base_h - 0.02)
            confidence = spec["confidence"] + 0.025 * wave + rng.uniform(-0.006, 0.006)
            confidence = min(0.96, max(0.4, confidence))
            if confidence < confidence_threshold:
                continue
            detection = {
                "class_id": info["id"],
                "confidence": round(confidence, 4),
                "x": x,
                "y": y,
                "w": base_w,
                "h": base_h,
            }
            frame_detections.append((detection, spec["track_id"]))
            if spec["first_seen"] is None:
                spec["first_seen"] = timestamp
            spec["last_seen"] = timestamp
            spec["max_confidence"] = max(spec["max_confidence"], confidence)
        peak_objects = max(peak_objects, len(frame_detections))
        frames.append({"time": round(timestamp, 3), "detections": frame_detections})

    tracks = []
    for spec in specs:
        if spec["first_seen"] is None:
            continue
        last_detection = None
        for frame in reversed(frames):
            for detection, track_id in frame["detections"]:
                if track_id == spec["track_id"]:
                    last_detection = detection
                    break
            if last_detection:
                break
        if not last_detection:
            continue
        tracks.append(
            {
                "id": spec["track_id"],
                "class_id": spec["info"]["id"],
                "x": last_detection["x"],
                "y": last_detection["y"],
                "w": last_detection["w"],
                "h": last_detection["h"],
                "first_seen": float(spec["first_seen"]),
                "last_seen": float(spec["last_seen"]),
                "max_confidence": round(float(spec["max_confidence"]), 4),
            }
        )
    return frames, tracks, peak_objects


# =========================================================
# Tracking / summaries
# =========================================================


def _iou(a, b):
    x1 = max(a["x"], b["x"])
    y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["w"], b["x"] + b["w"])
    y2 = min(a["y"] + a["h"], b["y"] + b["h"])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = a["w"] * a["h"] + b["w"] * b["h"] - intersection
    return intersection / union if union > 0 else 0.0


class DamageTracker:
    def __init__(self, max_gap_seconds=1.6, match_iou=0.18):
        self.max_gap_seconds = max_gap_seconds
        self.match_iou = match_iou
        self.tracks = {}
        self.next_id = 1

    @property
    def all_tracks(self):
        return sorted(self.tracks.values(), key=lambda item: item["id"])

    def update(self, detections, timestamp):
        assigned = []
        used_ids = set()
        for detection in sorted(detections, key=lambda item: item["confidence"], reverse=True):
            best_id = None
            best_iou = self.match_iou
            for track_id, track in self.tracks.items():
                if track_id in used_ids or track["class_id"] != detection["class_id"]:
                    continue
                if timestamp - track["last_seen"] > self.max_gap_seconds:
                    continue
                score = _iou(detection, track)
                if score > best_iou:
                    best_iou = score
                    best_id = track_id
            if best_id is None:
                best_id = self.next_id
                self.next_id += 1
                self.tracks[best_id] = {
                    "id": best_id,
                    "class_id": detection["class_id"],
                    "x": detection["x"],
                    "y": detection["y"],
                    "w": detection["w"],
                    "h": detection["h"],
                    "first_seen": timestamp,
                    "last_seen": timestamp,
                    "max_confidence": detection["confidence"],
                }
            else:
                track = self.tracks[best_id]
                track.update(
                    {
                        "x": detection["x"],
                        "y": detection["y"],
                        "w": detection["w"],
                        "h": detection["h"],
                        "last_seen": timestamp,
                        "max_confidence": max(track["max_confidence"], detection["confidence"]),
                    }
                )
            used_ids.add(best_id)
            assigned.append((detection, best_id))
        return assigned


def summarize_image(detections, classes):
    class_map = classes_by_id(classes)
    counts = {}
    for item in detections:
        counts[item["class_id"]] = counts.get(item["class_id"], 0) + 1
    by_class = []
    for class_id in sorted(counts):
        info = class_map.get(class_id)
        if not info:
            continue
        by_class.append(
            {
                "class_id": info["id"],
                "class_key": info["key"],
                "class_name": info["name"],
                "color": info["color"],
                "count": counts[class_id],
            }
        )
    average = sum(item["confidence"] for item in detections) / len(detections) if detections else 0
    return {
        "total": len(detections),
        "by_class": by_class,
        "average_confidence": round(average, 4),
        "peak_objects": len(detections),
    }


def summarize_tracks(tracks, classes, peak_objects):
    class_map = classes_by_id(classes)
    counts = {}
    for track in tracks:
        counts[track["class_id"]] = counts.get(track["class_id"], 0) + 1
    by_class = []
    for class_id in sorted(counts):
        info = class_map.get(class_id)
        if not info:
            continue
        by_class.append(
            {
                "class_id": info["id"],
                "class_key": info["key"],
                "class_name": info["name"],
                "color": info["color"],
                "count": counts[class_id],
            }
        )
    average = (
        sum(track["max_confidence"] for track in tracks) / len(tracks) if tracks else 0
    )
    return {
        "total": len(tracks),
        "by_class": by_class,
        "average_confidence": round(average, 4),
        "peak_objects": peak_objects,
    }
