"""FastAPI entry point for the vehicle damage detection website."""

from __future__ import annotations

import atexit
import json
import logging
import os
import re
import secrets
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Path as PathParam,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

from inference import (  # noqa: E402
    DEMO_NOTICE,
    DamageTracker,
    InputMediaError,
    ModelEngine,
    annotate_thumbnail,
    classes_by_id,
    decode_image,
    demo_video_frames,
    effective_sample_fps,
    probe_video,
    process_video_keyframes,
    seed_from_bytes,
    seed_from_text,
    summarize_image,
    summarize_tracks,
)
from storage import (  # noqa: E402
    RETENTION_DAYS,
    clear_history,
    get_thumbnail,
    init_db,
    list_history,
    save_record,
)

logger = logging.getLogger(__name__)


# =========================================================
# Configuration
# =========================================================


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _env_float(name: str, default: float, minimum: float = 0.0) -> float:
    try:
        return max(minimum, float(os.getenv(name, str(default))))
    except ValueError:
        return default


def _path_setting(name: str, default: str) -> Path:
    path = Path(os.getenv(name, default))
    return path if path.is_absolute() else BASE_DIR / path


DETECTION_MODE = os.getenv("DETECTION_MODE", "auto").strip().lower()
MODEL_PATH = _path_setting("MODEL_PATH", "best.onnx")
CLASSES_PATH = _path_setting("CLASSES_PATH", "classes.json")
MODEL_NAME = os.getenv("MODEL_NAME", "车辆受损检测模型")
MODEL_INPUT_SIZE = _env_int("MODEL_INPUT_SIZE", 640)
MODEL_OUTPUT_FORMAT = os.getenv("MODEL_OUTPUT_FORMAT", "auto").strip().lower()
MODEL_BOX_FORMAT = os.getenv("MODEL_BOX_FORMAT", "auto").strip().lower()
MODEL_INPUT_COLOR = os.getenv("MODEL_INPUT_COLOR", "rgb").strip().lower()
MODEL_MAX_DETECTIONS = _env_int("MODEL_MAX_DETECTIONS", 100)
ONNX_PROVIDERS = [
    item.strip()
    for item in os.getenv(
        "ONNX_PROVIDERS", "CUDAExecutionProvider,CPUExecutionProvider"
    ).split(",")
    if item.strip()
]

MAX_IMAGE_MB = _env_int("MAX_IMAGE_MB", 15)
MAX_VIDEO_MB = _env_int("MAX_VIDEO_MB", 200)
MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024
MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
MAX_IMAGE_PIXELS = _env_int("MAX_IMAGE_PIXELS", 40_000_000)
MAX_VIDEO_SECONDS = _env_int("MAX_VIDEO_SECONDS", 180)
VIDEO_SAMPLE_FPS = _env_float("VIDEO_SAMPLE_FPS", 3.0, 0.5)
VIDEO_WORKERS = _env_int("VIDEO_WORKERS", 2)
JOB_TTL_SECONDS = _env_int("JOB_TTL_SECONDS", 3600)
THUMBNAIL_MAX_WIDTH = _env_int("THUMBNAIL_MAX_WIDTH", 720)

def _select_upload_tmp_dir() -> Path:
    configured = os.getenv("UPLOAD_TMP_DIR")
    candidates = [Path(configured)] if configured else []
    for variable in ("TMP", "TEMP"):
        value = os.getenv(variable)
        if value:
            candidates.append(Path(value))
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data) / "Temp")
    candidates.append(BASE_DIR / ".uploads")

    seen = set()
    for candidate in candidates:
        try:
            target = candidate.resolve()
            if target in seen:
                continue
            seen.add(target)
            if configured:
                directory = target
            else:
                directory = target / "vehicle-damage-uploads"
            directory.mkdir(parents=True, exist_ok=True)
            probe = directory / ".write-test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return directory
        except OSError:
            continue
    raise RuntimeError("无法创建视频上传临时目录，请检查系统临时目录权限。")


UPLOAD_TMP_DIR = _select_upload_tmp_dir()
logger.info("视频上传临时目录：%s", UPLOAD_TMP_DIR)
ALLOWED_ORIGINS = [
    item.strip()
    for item in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if item.strip()
]
if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("使用会话 Cookie 时 ALLOWED_ORIGINS 不能配置为 *。")

SESSION_COOKIE = os.getenv("SESSION_COOKIE_NAME", "cs_session")
SESSION_MAX_AGE = _env_int("SESSION_MAX_AGE_DAYS", 30) * 24 * 60 * 60
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
APP_VERSION = "1.0.0"
SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov"}


# =========================================================
# Model / DB / background job infrastructure
# =========================================================


engine = ModelEngine(
    mode=DETECTION_MODE,
    model_path=MODEL_PATH,
    classes_path=CLASSES_PATH,
    model_name=MODEL_NAME,
    input_size=MODEL_INPUT_SIZE,
    providers=ONNX_PROVIDERS,
    output_format=MODEL_OUTPUT_FORMAT,
    box_format=MODEL_BOX_FORMAT,
    input_color=MODEL_INPUT_COLOR,
    max_detections=MODEL_MAX_DETECTIONS,
)

init_db()
VIDEO_EXECUTOR = ThreadPoolExecutor(
    max_workers=max(1, VIDEO_WORKERS), thread_name_prefix="video-job"
)
atexit.register(lambda: VIDEO_EXECUTOR.shutdown(wait=False, cancel_futures=True))


def _cleanup_stale_uploads(max_age_seconds: int = 6 * 60 * 60) -> None:
    cutoff = time.time() - max_age_seconds
    try:
        for path in UPLOAD_TMP_DIR.glob("upload-*"):
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
    except OSError:
        logger.warning("清理临时上传文件失败", exc_info=True)


_cleanup_stale_uploads()

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.RLock()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_job(session_id: str) -> dict:
    job = {
        "job_id": uuid.uuid4().hex,
        "session_id": session_id,
        "status": "queued",
        "progress": 0,
        "stage": "等待处理",
        "result": None,
        "error": None,
        "updated_at": time.time(),
    }
    with JOBS_LOCK:
        _cleanup_expired_jobs()
        JOBS[job["job_id"]] = job
    return job


def _update_job(job_id: str, **changes):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job.update(changes)
        job["updated_at"] = time.time()


def _job_snapshot(job: dict) -> dict:
    with JOBS_LOCK:
        return {
            "job_id": job["job_id"],
            "status": job["status"],
            "progress": job["progress"],
            "stage": job["stage"],
            "result": job["result"],
            "error": job["error"],
        }


def _cleanup_expired_jobs():
    cutoff = time.time() - JOB_TTL_SECONDS
    expired = [
        job_id
        for job_id, job in JOBS.items()
        if job["status"] in {"completed", "failed"} and job["updated_at"] < cutoff
    ]
    for job_id in expired:
        JOBS.pop(job_id, None)


def _get_owned_job(job_id: str, session_id: str | None):
    if not session_id:
        return None
    with JOBS_LOCK:
        _cleanup_expired_jobs()
        job = JOBS.get(job_id)
        if not job or job["session_id"] != session_id:
            return None
        return job


# =========================================================
# Small shared helpers
# =========================================================


def ensure_session(request: Request, response: Response) -> str:
    existing = request.cookies.get(SESSION_COOKIE)
    if existing and SESSION_PATTERN.fullmatch(existing):
        return existing
    session_id = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/api",
    )
    return session_id


def sanitize_filename(name: str | None, fallback: str = "未命名文件") -> str:
    if not name:
        return fallback
    base = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = "".join(char for char in base if char >= " " and char != "\x7f")
    if not base:
        return fallback
    if len(base) > 120:
        stem, dot, suffix = base.rpartition(".")
        if dot and len(suffix) <= 10:
            base = f"{stem[: 115 - len(suffix)]}.{suffix}"
        else:
            base = base[:120]
    return base


def safe_unlink(path: str | Path):
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass


def validate_upload_type(file: UploadFile, expected: str) -> tuple[str, str]:
    name = sanitize_filename(file.filename)
    suffix = Path(name).suffix.lower()
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    allowed_types = IMAGE_TYPES if expected == "image" else VIDEO_TYPES
    allowed_ext = IMAGE_EXTENSIONS if expected == "image" else VIDEO_EXTENSIONS

    if suffix not in allowed_ext and content_type not in allowed_types:
        if expected == "image":
            raise HTTPException(415, "仅支持 JPG、PNG、WebP 格式的图片。")
        raise HTTPException(415, "仅支持 MP4、WebM、MOV 格式的视频。")

    if suffix not in allowed_ext:
        suffix = ".jpg" if expected == "image" else ".mp4"
    return name, suffix


async def read_upload_bytes(file: UploadFile, limit: int, label: str = "文件") -> bytes:
    if file.size is not None and file.size > limit:
        raise HTTPException(413, f"{label}大小超过限制（最大 {limit // 1024 // 1024} MB）。")
    chunks = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(413, f"{label}大小超过限制（最大 {limit // 1024 // 1024} MB）。")
        chunks.append(chunk)
    if total == 0:
        raise HTTPException(400, "上传的文件为空。")
    return b"".join(chunks)


async def save_video_temp(file: UploadFile, suffix: str) -> tuple[Path, int]:
    if file.size is not None and file.size > MAX_VIDEO_BYTES:
        raise HTTPException(413, f"视频大小超过限制（最大 {MAX_VIDEO_MB} MB）。")
    handle = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
        prefix="upload-",
        dir=UPLOAD_TMP_DIR,
    )
    path = Path(handle.name)
    total = 0
    try:
        with handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise HTTPException(413, f"视频大小超过限制（最大 {MAX_VIDEO_MB} MB）。")
                handle.write(chunk)
        if total == 0:
            raise HTTPException(400, "上传的视频为空。")
        return path, total
    except Exception:
        safe_unlink(path)
        raise


def _make_detection(raw: dict, info: dict, detection_id: str, track_id=None, timestamp=None):
    return {
        "id": detection_id,
        "class_id": info["id"],
        "class_key": info["key"],
        "class_name": info["name"],
        "color": info["color"],
        "confidence": round(float(raw["confidence"]), 4),
        "bbox": {
            "x": round(min(max(float(raw["x"]), 0.0), 1.0), 6),
            "y": round(min(max(float(raw["y"]), 0.0), 1.0), 6),
            "w": round(min(max(float(raw["w"]), 0.0), 1.0), 6),
            "h": round(min(max(float(raw["h"]), 0.0), 1.0), 6),
        },
        "track_id": track_id,
        "time": round(timestamp, 3) if timestamp is not None else None,
    }


def _enrich_detections(raw_detections, classes, with_track_ids=None):
    class_map = classes_by_id(classes)
    enriched = []
    for index, raw in enumerate(raw_detections):
        info = class_map.get(raw["class_id"])
        if not info:
            continue
        track_id = with_track_ids[index] if with_track_ids else None
        enriched.append(
            _make_detection(
                raw,
                info,
                detection_id=f"d-{uuid.uuid4().hex[:12]}",
                track_id=track_id,
            )
        )
    return enriched


def _save_history_safely(**kwargs):
    try:
        return save_record(**kwargs)
    except Exception:  # noqa: BLE001
        logger.exception("保存检测记录失败")
        return None


# =========================================================
# FastAPI application
# =========================================================


app = FastAPI(
    title="车损智检识别服务",
    version=APP_VERSION,
    description=(
        "车辆受损检测后端：图片识别、视频异步任务、演示模式、"
        "30 天会话记录和 ONNX 模型状态。"
    ),
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api") and not request.url.path.endswith("/thumbnail"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": "提交的数据格式不正确，请检查文件与识别参数。"},
    )


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, exc: Exception):
    logger.exception("未处理的服务异常")
    return JSONResponse(status_code=500, content={"detail": "服务暂时不可用，请稍后重试。"})


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "mode": engine.mode,
        "model_ready": engine.ready,
    }


@app.get("/api/model")
def model_status():
    return engine.status()


@app.post("/api/detections/image")
async def detect_image(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    confidence: float = Form(0.35, ge=0.05, le=0.95),
    iou: float = Form(0.45, ge=0.05, le=0.95),
):
    if not engine.ready or engine.mode not in {"demo", "model"}:
        raise HTTPException(503, engine.message)
    session_id = ensure_session(request, response)
    file_name, _suffix = validate_upload_type(file, "image")
    payload = await read_upload_bytes(file, MAX_IMAGE_BYTES, "图片")

    try:
        rgb, width, height, thumbnail = await run_in_threadpool(
            decode_image, payload, MAX_IMAGE_PIXELS, THUMBNAIL_MAX_WIDTH
        )
    except InputMediaError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        raw_detections, inference_ms = await run_in_threadpool(
            engine.detect,
            rgb,
            seed_from_bytes(payload),
            confidence,
            iou,
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("图片识别失败")
        raise HTTPException(500, "图片识别失败，请稍后重试或更换图片。") from exc

    detections = _enrich_detections(raw_detections, engine.classes)
    detections.sort(key=lambda item: item["confidence"], reverse=True)
    summary = summarize_image(detections, engine.classes)
    created_at = _utc_now_iso()
    history_id = _save_history_safely(
        session_id=session_id,
        media_type="image",
        file_name=file_name,
        mode=engine.mode,
        model_name=engine.model_name,
        summary=summary,
        params={"confidence": round(confidence, 4), "iou": round(iou, 4)},
        width=width,
        height=height,
        duration=None,
        file_size=len(payload),
        inference_ms=inference_ms,
        thumbnail=annotate_thumbnail(thumbnail, detections),
    )
    return {
        "id": uuid.uuid4().hex,
        "media_type": "image",
        "mode": engine.mode,
        "model_name": engine.model_name,
        "file_name": file_name,
        "width": width,
        "height": height,
        "inference_ms": round(inference_ms, 2),
        "detections": detections,
        "summary": summary,
        "created_at": created_at,
        "history_id": history_id,
        "demo_notice": DEMO_NOTICE if engine.mode == "demo" else None,
    }


@app.post("/api/detections/video", status_code=202)
async def detect_video(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    confidence: float = Form(0.35, ge=0.05, le=0.95),
    iou: float = Form(0.45, ge=0.05, le=0.95),
):
    if not engine.ready or engine.mode not in {"demo", "model"}:
        raise HTTPException(503, engine.message)
    session_id = ensure_session(request, response)
    file_name, suffix = validate_upload_type(file, "video")
    video_path, file_size = await save_video_temp(file, suffix)

    try:
        metadata, thumbnail = await run_in_threadpool(
            probe_video, video_path, MAX_VIDEO_SECONDS, THUMBNAIL_MAX_WIDTH
        )
    except InputMediaError as exc:
        safe_unlink(video_path)
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        safe_unlink(video_path)
        logger.exception("视频探测失败")
        raise HTTPException(400, "无法解析该视频，请转换为 MP4（H.264）后重试。") from exc

    job = _new_job(session_id)
    VIDEO_EXECUTOR.submit(
        _run_video_job,
        job["job_id"],
        video_path,
        file_name,
        file_size,
        metadata,
        thumbnail,
        confidence,
        iou,
    )
    return _job_snapshot(job)


def _run_video_job(
    job_id,
    video_path,
    file_name,
    file_size,
    metadata,
    thumbnail,
    confidence,
    iou,
):
    try:
        _update_job(job_id, status="processing", progress=3, stage="正在解析视频画面")
        sample_fps = effective_sample_fps(metadata["fps"], VIDEO_SAMPLE_FPS)
        timeline = []
        tracks_raw = []
        frames_processed = 0
        peak_objects = 0
        inference_total = 0.0
        started = time.perf_counter()

        if engine.mode == "demo":
            _update_job(job_id, progress=22, stage="正在生成演示标注")
            frames, tracks_raw, peak_objects = demo_video_frames(
                metadata["duration"],
                engine.classes,
                sample_fps,
                confidence,
                seed_from_text(f"{file_name}:{file_size}"),
                metadata["width"],
                metadata["height"],
            )
            frames_processed = len(frames)
            for frame in frames:
                frame_detections = []
                for raw, track_id in frame["detections"]:
                    info = classes_by_id(engine.classes).get(raw["class_id"])
                    if not info:
                        continue
                    frame_detections.append(
                        _make_detection(
                            raw,
                            info,
                            f"t{track_id}-{int(round(frame['time'] * 1000))}",
                            track_id,
                            frame["time"],
                        )
                    )
                timeline.append({"time": frame["time"], "detections": frame_detections})
            _update_job(job_id, progress=82, stage="正在整理检测结果")
            inference_total = max(0.1, (time.perf_counter() - started) * 1000)
        else:
            def detect_frame(rgb, _timestamp):
                nonlocal inference_total
                raw, single_ms = engine.detect(
                    rgb,
                    confidence=confidence,
                    iou=iou,
                )
                inference_total += single_ms
                return raw

            def update_progress(progress):
                _update_job(
                    job_id,
                    progress=min(90, 5 + int(progress * 0.84)),
                    stage="正在识别视频画面",
                )

            keyframes, frames_processed = process_video_keyframes(
                video_path,
                metadata,
                sample_fps,
                detect_frame,
                update_progress,
            )
            tracker = DamageTracker()
            for timestamp, raw_detections in keyframes:
                assigned = tracker.update(raw_detections, timestamp)
                peak_objects = max(peak_objects, len(assigned))
                frame_detections = []
                for raw, track_id in assigned:
                    info = classes_by_id(engine.classes).get(raw["class_id"])
                    if not info:
                        continue
                    frame_detections.append(
                        _make_detection(
                            raw,
                            info,
                            f"t{track_id}-{int(round(timestamp * 1000))}",
                            track_id,
                            timestamp,
                        )
                    )
                timeline.append({"time": timestamp, "detections": frame_detections})
            tracks_raw = tracker.all_tracks
            _update_job(job_id, progress=92, stage="正在整理检测结果")

        class_map = classes_by_id(engine.classes)
        tracks = []
        for track in tracks_raw:
            info = class_map.get(track["class_id"])
            if not info:
                continue
            tracks.append(
                {
                    "id": track["id"],
                    "class_id": info["id"],
                    "class_key": info["key"],
                    "class_name": info["name"],
                    "color": info["color"],
                    "confidence": round(track["max_confidence"], 4),
                    "first_seen": round(track["first_seen"], 3),
                    "last_seen": round(track["last_seen"], 3),
                }
            )

        summary = summarize_tracks(tracks_raw, engine.classes, peak_objects)
        created_at = _utc_now_iso()
        first_frame_detections = timeline[0]["detections"] if timeline else []
        history_id = _save_history_safely(
            session_id=_get_job_session(job_id),
            media_type="video",
            file_name=file_name,
            mode=engine.mode,
            model_name=engine.model_name,
            summary=summary,
            params={"confidence": round(confidence, 4), "iou": round(iou, 4)},
            width=metadata["width"],
            height=metadata["height"],
            duration=metadata["duration"],
            file_size=file_size,
            inference_ms=inference_total,
            thumbnail=annotate_thumbnail(thumbnail, first_frame_detections),
        )

        result = {
            "id": uuid.uuid4().hex,
            "media_type": "video",
            "mode": engine.mode,
            "model_name": engine.model_name,
            "file_name": file_name,
            "width": metadata["width"],
            "height": metadata["height"],
            "duration": metadata["duration"],
            "fps": metadata["fps"],
            "sampled_fps": round(sample_fps, 3),
            "frames_processed": frames_processed,
            "inference_ms": round(inference_total, 2),
            "timeline": timeline,
            "tracks": tracks,
            "summary": summary,
            "created_at": created_at,
            "history_id": history_id,
            "demo_notice": DEMO_NOTICE if engine.mode == "demo" else None,
        }
        _update_job(
            job_id,
            status="completed",
            progress=100,
            stage="识别完成",
            result=result,
            error=None,
        )
    except InputMediaError as exc:
        _update_job(job_id, status="failed", stage="识别失败", error=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("视频任务处理失败")
        _update_job(
            job_id,
            status="failed",
            stage="识别失败",
            error="视频处理出现内部错误，请稍后重试或更换视频。",
        )
    finally:
        safe_unlink(video_path)


def _get_job_session(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        return job["session_id"] if job else ""


@app.get("/api/jobs/{job_id}")
def job_status(request: Request, job_id: str = PathParam(min_length=8, max_length=80)):
    job = _get_owned_job(job_id, request.cookies.get(SESSION_COOKIE))
    if not job:
        raise HTTPException(404, "任务不存在或已过期。")
    return _job_snapshot(job)


@app.get("/api/history")
def history(
    request: Request,
    response: Response,
    limit: int = Query(20, ge=1, le=50),
):
    session_id = ensure_session(request, response)
    items, total = list_history(session_id, limit)
    return {"items": items, "total": total, "retention_days": RETENTION_DAYS}


@app.get("/api/history/{record_id}/thumbnail")
def history_thumbnail(request: Request, record_id: int = PathParam(ge=1)):
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        raise HTTPException(404, "记录不存在。")
    thumbnail = get_thumbnail(session_id, record_id)
    if not thumbnail:
        raise HTTPException(404, "缩略图不存在。")
    content, mime = thumbnail
    return Response(
        content=content,
        media_type=mime,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.delete("/api/history", status_code=204)
def remove_history(request: Request, response: Response):
    session_id = ensure_session(request, response)
    clear_history(session_id)
    response.status_code = 204
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", include_in_schema=False)
def root():
    return {
        "service": "车损智检识别服务",
        "version": APP_VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }
