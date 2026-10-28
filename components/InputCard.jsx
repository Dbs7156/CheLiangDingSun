"use client";

import { useEffect, useRef, useState } from "react";
import {
  API_BASE_URL,
  FALLBACK_CLASSES,
  FILE_LIMITS,
  SITE,
} from "../data/site";

const DEFAULT_SETTINGS = { confidence: 0.35, iou: 0.45 };
const SETTINGS_KEY = "vehicle-damage-settings-v1";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

function InfoTip({ id, title, description, note, arrow = 68 }) {
  const descriptionId = `${id}-description`;

  return (
    <span className="help-tooltip">
      <button
        type="button"
        className="info-dot"
        aria-label={`查看${title}说明`}
        aria-describedby={descriptionId}
      >
        ?
      </button>
      <span className="visually-hidden" id={descriptionId}>
        {description}
        {note ? ` ${note}` : ""}
      </span>
      <span
        className="help-tooltip__bubble"
        aria-hidden="true"
        role="tooltip"
        style={{ "--tooltip-arrow": `${arrow}px` }}
      >
        <strong>{title}</strong>
        <span>{description}</span>
        {note ? <span className="help-tooltip__note">{note}</span> : null}
      </span>
    </span>
  );
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isImageFile(file) {
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.includes(extensionOf(file.name));
}

function isVideoFile(file) {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(extensionOf(file.name));
}

function validateFile(file) {
  if (!file) return { ok: false, kind: null, message: "没有读取到文件。" };

  const image = isImageFile(file);
  const video = isVideoFile(file);
  if (!image && !video) {
    return {
      ok: false,
      kind: null,
      message: "仅支持 JPG、PNG、WebP 图片，或 MP4、WebM、MOV 视频。",
    };
  }

  if (image) {
    if (
      file.type &&
      !IMAGE_TYPES.includes(file.type) &&
      !IMAGE_EXTENSIONS.includes(extensionOf(file.name))
    ) {
      return { ok: false, kind: "image", message: "请上传 JPG、PNG 或 WebP 格式的图片。" };
    }
    if (file.size > FILE_LIMITS.imageBytes) {
      return {
        ok: false,
        kind: "image",
        message: `图片大小不能超过 ${FILE_LIMITS.imageLabel}，请压缩后重试。`,
      };
    }
    return { ok: true, kind: "image" };
  }

  if (video && file.type && !VIDEO_TYPES.includes(file.type) && !VIDEO_EXTENSIONS.includes(extensionOf(file.name))) {
    return { ok: false, kind: "video", message: "请上传 MP4、WebM 或 MOV 格式的视频。" };
  }
  if (file.size > FILE_LIMITS.videoBytes) {
    return {
      ok: false,
      kind: "video",
      message: `视频大小不能超过 ${FILE_LIMITS.videoLabel}，请压缩后重试。`,
    };
  }
  return { ok: true, kind: "video" };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatPercent(value, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function getImageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("读取图片超时，请更换图片后重试。"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    }

    image.onload = () => {
      cleanup();
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("无法读取图片尺寸，请更换图片后重试。"));
        return;
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("图片无法解码，请更换 JPG、PNG 或 WebP 文件。"));
    };
    image.src = url;
  });
}

function getVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error("读取视频信息超时。请使用浏览器可直接播放的 MP4（H.264）或 WebM 视频。"),
      );
    }, 20000);

    function cleanup() {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      video.onloadedmetadata = null;
      video.onerror = null;
    }

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
        reject(new Error("无法读取视频画面信息，请转换为 MP4（H.264）或 WebM 格式后重试。"));
        return;
      }
      if (duration > FILE_LIMITS.videoDurationSeconds + 0.5) {
        reject(new Error(`视频时长不能超过 ${FILE_LIMITS.videoDurationLabel}，请剪辑后重试。`));
        return;
      }
      resolve({ width, height, duration });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("浏览器无法预览该视频，请转换为 MP4（H.264）或 WebM 格式后重试。"));
    };
    video.src = url;
  });
}

async function inspectMedia(file, kind) {
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const dimensions = await getImageDimensions(url);
      return { file, url, kind, width: dimensions.width, height: dimensions.height, duration: null, size: file.size };
    }
    const metadata = await getVideoMetadata(url);
    return { file, url, kind, width: metadata.width, height: metadata.height, duration: metadata.duration, size: file.size };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function readErrorDetail(payload) {
  if (!payload || typeof payload !== "object") return "";
  const detail = payload.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return "";
}

async function errorFromResponse(response) {
  let message = "";
  try {
    message = readErrorDetail(await response.json());
  } catch {
    // Non-JSON proxy errors fall through to a status-based message.
  }
  if (!message) {
    if (response.status === 404) message = "请求的内容不存在或已过期。";
    else if (response.status === 413) message = "文件大小超过服务端限制。";
    else if (response.status === 429) message = "请求过于频繁，请稍后再试。";
    else if (response.status >= 500) message = "识别服务暂时不可用，请稍后再试。";
    else message = `请求失败（${response.status}）`;
  }
  return new Error(message);
}

function timeoutSignal(signal, milliseconds) {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    function handleAbort() {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function ImageOverlay({ detections, activeDetectionId }) {
  return (
    <div className="image-overlay">
      {detections.map((detection) => {
        const labelAbove = detection.bbox.y > 0.055;
        return (
          <div
            key={detection.id}
            className={`detection-box ${activeDetectionId === detection.id ? "is-active" : ""}`}
            style={{
              left: `${detection.bbox.x * 100}%`,
              top: `${detection.bbox.y * 100}%`,
              width: `${detection.bbox.w * 100}%`,
              height: `${detection.bbox.h * 100}%`,
              borderColor: detection.color,
              background: `${detection.color}24`,
              boxShadow: activeDetectionId === detection.id
                ? `0 0 0 2px rgba(255,255,255,.65), 0 0 30px -6px ${detection.color}`
                : `0 0 20px -10px ${detection.color}`,
            }}
          >
            <span
              className={`detection-label ${labelAbove ? "detection-label--above" : "detection-label--below"}`}
              style={{ backgroundColor: detection.color }}
            >
              {detection.class_name}
              <span>{Math.round(detection.confidence * 100)}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function findFrame(timeline, time) {
  if (!timeline.length) return { previous: null, next: null, ratio: 0 };
  let low = 0;
  let high = timeline.length - 1;
  let index = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timeline[middle].time <= time + 0.0001) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (index < 0) return { previous: null, next: timeline[0], ratio: 0 };
  const previous = timeline[index];
  const next = timeline[index + 1] || null;
  const duration = next ? next.time - previous.time : 0;
  return {
    previous,
    next,
    ratio: duration > 0 ? Math.min(1, Math.max(0, (time - previous.time) / duration)) : 0,
  };
}

function interpolateDetections(previous, next, ratio) {
  if (!previous) return [];
  if (!next || ratio <= 0) return previous.detections;
  return previous.detections.map((detection) => {
    const matching = detection.track_id
      ? next.detections.find((item) => item.track_id === detection.track_id)
      : null;
    if (!matching) return detection;
    return {
      ...detection,
      confidence: detection.confidence + (matching.confidence - detection.confidence) * ratio,
      bbox: {
        x: detection.bbox.x + (matching.bbox.x - detection.bbox.x) * ratio,
        y: detection.bbox.y + (matching.bbox.y - detection.bbox.y) * ratio,
        w: detection.bbox.w + (matching.bbox.w - detection.bbox.w) * ratio,
        h: detection.bbox.h + (matching.bbox.h - detection.bbox.h) * ratio,
      },
    };
  });
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function VideoOverlay({ videoRef, timeline, visible }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ timeline, visible });
  stateRef.current = { timeline, visible };

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return undefined;

    let frameRequest = 0;
    let disposed = false;

    function draw() {
      if (disposed) return;
      const context = canvas.getContext("2d");
      const rect = canvas.getBoundingClientRect();
      if (!context || !rect.width || !rect.height) return;

      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.round(rect.width * ratio);
      const pixelHeight = Math.round(rect.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const current = stateRef.current;
      if (!current.visible || !current.timeline.length) return;
      const frame = findFrame(current.timeline, video.currentTime);
      const detections = interpolateDetections(frame.previous, frame.next, frame.ratio);
      if (!detections.length) return;

      const fontSize = Math.max(10, Math.min(13, rect.width * 0.016));
      const labelHeight = fontSize + 10;
      const lineWidth = Math.max(1.5, Math.min(2.5, rect.width * 0.003));
      context.font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      context.textBaseline = "middle";

      detections.forEach((detection) => {
        const x = detection.bbox.x * rect.width;
        const y = detection.bbox.y * rect.height;
        const width = detection.bbox.w * rect.width;
        const height = detection.bbox.h * rect.height;
        if (width < 2 || height < 2) return;

        context.strokeStyle = detection.color;
        context.lineWidth = lineWidth;
        context.shadowColor = "rgba(0,0,0,0.35)";
        context.shadowBlur = 5;
        context.strokeRect(x, y, width, height);
        context.shadowBlur = 0;
        context.fillStyle = `${detection.color}1f`;
        context.fillRect(x, y, width, height);

        const label = `${detection.class_name}  ${Math.round(detection.confidence * 100)}%`;
        const labelWidth = context.measureText(label).width + 14;
        const above = y - labelHeight >= 0;
        const labelY = above ? y - labelHeight : y + 2;
        context.fillStyle = detection.color;
        roundRect(context, x, labelY, labelWidth, labelHeight, 4);
        context.fill();
        context.fillStyle = "#fff";
        context.fillText(label, x + 7, labelY + labelHeight / 2 + 0.5);
      });
    }

    function scheduleFrames() {
      const element = video;
      if (element.requestVideoFrameCallback) {
        const loop = () => {
          if (disposed) return;
          draw();
          frameRequest = element.requestVideoFrameCallback(loop);
        };
        frameRequest = element.requestVideoFrameCallback(loop);
      } else {
        const loop = () => {
          if (disposed) return;
          draw();
          frameRequest = window.requestAnimationFrame(loop);
        };
        frameRequest = window.requestAnimationFrame(loop);
      }
    }

    draw();
    scheduleFrames();
    const onSeek = () => draw();
    video.addEventListener("seeked", onSeek);
    video.addEventListener("loadedmetadata", onSeek);
    video.addEventListener("pause", onSeek);
    const resizeObserver = new ResizeObserver(onSeek);
    resizeObserver.observe(video);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameRequest);
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameRequest);
      resizeObserver.disconnect();
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("loadedmetadata", onSeek);
      video.removeEventListener("pause", onSeek);
    };
  }, [videoRef, timeline, visible]);

  return <canvas ref={canvasRef} className="video-overlay" aria-hidden="true" />;
}

export default function InputCard({
  model,
  modelLoading,
  modelError,
  onRetryModel,
  result,
  activeDetectionId,
  onActiveDetection,
  onResult,
  onClearResult,
  videoRef,
}) {
  const [media, setMedia] = useState(null);
  const mediaRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [indeterminate, setIndeterminate] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.confidence === "number" && typeof parsed.iou === "number") {
          setSettings({
            confidence: Math.min(0.9, Math.max(0.1, parsed.confidence)),
            iou: Math.min(0.9, Math.max(0.1, parsed.iou)),
          });
        }
      }
    } catch {
      // Local storage is optional; detection still works without it.
    }
    return () => {
      abortRef.current?.abort();
      if (mediaRef.current) URL.revokeObjectURL(mediaRef.current.url);
    };
  }, []);

  function updateSettings(patch) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage limitations in private browsing modes.
      }
      return next;
    });
  }

  const hasResult = Boolean(result);
  const classes = model?.classes?.length ? model.classes : FALLBACK_CLASSES;
  const serviceDown = modelError || (!modelLoading && !model);
  const modelUnavailable = model?.mode === "unavailable";
  const canRun = Boolean(media) && !running && !preparing && !modelLoading && !serviceDown && !modelUnavailable;

  function releaseCurrentMedia() {
    if (mediaRef.current) URL.revokeObjectURL(mediaRef.current.url);
    mediaRef.current = null;
  }

  async function useFile(file) {
    if (!file || running) return;
    const validation = validateFile(file);
    if (!validation.ok) {
      setError(validation.message || "文件无法使用。");
      return;
    }

    setPreparing(true);
    setError("");
    try {
      const inspected = await inspectMedia(file, validation.kind);
      abortRef.current?.abort();
      abortRef.current = null;
      releaseCurrentMedia();
      mediaRef.current = inspected;
      setMedia(inspected);
      setOverlayVisible(true);
      setError("");
      setProgress(0);
      setStage("");
      setIndeterminate(false);
      onActiveDetection?.(null);
      onClearResult?.();
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "文件读取失败，请更换文件。");
    } finally {
      setPreparing(false);
    }
  }

  function handleInputChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void useFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    if (running || preparing) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void useFile(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    if (!running && !preparing) setDragActive(true);
  }

  function removeFile() {
    if (running) return;
    abortRef.current?.abort();
    abortRef.current = null;
    releaseCurrentMedia();
    setMedia(null);
    setError("");
    setRunning(false);
    setProgress(0);
    setStage("");
    setIndeterminate(false);
    onActiveDetection?.(null);
    onClearResult?.();
  }

  async function loadSample() {
    if (running || sampleLoading) return;
    setSampleLoading(true);
    setError("");
    try {
      const response = await fetch(SITE.sampleImage);
      if (!response.ok) throw new Error("示例图片加载失败。");
      const blob = await response.blob();
      const file = new File([blob], "示例车辆-侧面.jpg", { type: blob.type || "image/jpeg" });
      await useFile(file);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "示例图片加载失败。");
    } finally {
      setSampleLoading(false);
    }
  }

  async function requestJson(path, init = {}, timeoutMs = 30000) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init.headers || {}) },
      signal: timeoutSignal(init.signal, timeoutMs),
    });
    if (!response.ok) throw await errorFromResponse(response);
    if (response.status === 204) return null;
    return response.json();
  }

  async function runDetection() {
    if (!media || !canRun) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const snapshot = { ...settings };
    onClearResult?.();
    onActiveDetection?.(null);
    setRunning(true);
    setError("");
    setOverlayVisible(true);
    setProgress(0);
    setStage(media.kind === "image" ? "正在分析车辆画面" : "正在上传视频");
    setIndeterminate(media.kind === "image");

    try {
      if (media.kind === "image") {
        const form = new FormData();
        form.append("file", media.file, media.file.name);
        form.append("confidence", String(snapshot.confidence));
        form.append("iou", String(snapshot.iou));
        const data = await requestJson(
          "/api/detections/image",
          { method: "POST", body: form, signal: controller.signal },
          180000,
        );
        if (data.media_type !== "image") throw new Error("识别服务返回了无效结果。");
        setIndeterminate(false);
        setProgress(100);
        setStage("识别完成");
        onResult(data, snapshot, media.url);
      } else {
        const form = new FormData();
        form.append("file", media.file, media.file.name);
        form.append("confidence", String(snapshot.confidence));
        form.append("iou", String(snapshot.iou));
        if (media.duration) form.append("duration", String(media.duration));
        let job = await requestJson(
          "/api/detections/video",
          { method: "POST", body: form, signal: controller.signal },
          300000,
        );
        setIndeterminate(job.status === "queued");
        setProgress(job.progress || 0);
        setStage(job.stage || "视频正在排队");
        const startedAt = Date.now();
        let failures = 0;

        while (job.status !== "completed" && job.status !== "failed") {
          if (Date.now() - startedAt > 30 * 60 * 1000) {
            throw new Error("视频处理超时，请缩短视频时长后重试。");
          }
          await wait(750, controller.signal);
          try {
            job = await requestJson(`/api/jobs/${job.job_id}`, { signal: controller.signal });
            failures = 0;
          } catch (pollError) {
            if (pollError?.name === "AbortError" || controller.signal.aborted) throw pollError;
            failures += 1;
            if (failures <= 3 && pollError instanceof TypeError) {
              setStage("网络抖动，正在重新连接");
              await wait(1400, controller.signal);
              continue;
            }
            throw pollError;
          }
          setIndeterminate(job.status === "queued");
          setProgress(job.progress || 0);
          setStage(job.stage || "正在处理视频");
        }

        if (job.status === "failed") throw new Error(job.error || "视频识别失败。");
        if (!job.result?.timeline) throw new Error("视频识别完成，但未收到有效结果。");
        setIndeterminate(false);
        setProgress(100);
        setStage("识别完成");
        onResult(job.result, snapshot, media.url);
      }
    } catch (runError) {
      if (runError?.name === "AbortError" || controller.signal.aborted) return;
      setError(runError instanceof Error ? runError.message : "识别失败，请稍后重试。");
      setStage("");
      setIndeterminate(false);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  const buttonLabel = !media
    ? "请先上传文件"
    : running
      ? media.kind === "image"
        ? "正在识别图片"
        : "正在识别视频"
      : modelLoading
        ? "正在检查服务"
        : serviceDown
          ? "识别服务未连接"
          : modelUnavailable
            ? "模型暂不可用"
            : hasResult
              ? "重新识别"
              : "开始智能识别";

  return (
    <div className="lab-grid" id="detection-workbench">
      <section className="lab-panel lab-canvas" aria-label="检测画布">
        <div className="lab-panel__head">
          <div className="panel-title">
            <span className="panel-index">01</span>
            <h3>检测画布</h3>
            {media ? (
              <span className="tag tag--soft">
                <svg className="icon" aria-hidden="true"><use href={`#i-${media.kind === "image" ? "image" : "film"}`} /></svg>
                {media.kind === "image" ? "图片" : "视频"}
              </span>
            ) : null}
            {result ? (
              <span className="panel-complete">
                <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
                已完成
              </span>
            ) : null}
            {running ? <span className="panel-running">正在识别</span> : null}
          </div>

          <div className="panel-actions">
            {result ? (
              <button
                type="button"
                className="link-button"
                onClick={() => setOverlayVisible((value) => !value)}
                aria-pressed={overlayVisible}
              >
                <svg className="icon" aria-hidden="true"><use href={`#i-${overlayVisible ? "eye" : "eye-off"}`} /></svg>
                标注
              </button>
            ) : null}
            {media && !running && !preparing ? (
              <>
                <button type="button" className="link-button" onClick={() => inputRef.current?.click()}>
                  <svg className="icon" aria-hidden="true"><use href="#i-refresh" /></svg>
                  更换
                </button>
                <button type="button" className="icon-button icon-button--danger" aria-label="移除当前文件" onClick={removeFile}>
                  <svg className="icon" aria-hidden="true"><use href="#i-trash" /></svg>
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div
          className={`lab-canvas__body ${dragActive ? "is-dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.mov"
            onChange={handleInputChange}
            tabIndex={-1}
            aria-label="选择待检测的图片或视频"
          />

          {!media ? (
            <div className="dropzone">
              <div className="dropzone__art" aria-hidden="true">
                <span className="dropzone__ring dropzone__ring--outer" />
                <span className="dropzone__ring dropzone__ring--inner" />
                <span className="dropzone__icon">
                  <svg className="icon" aria-hidden="true"><use href="#i-image" /></svg>
                </span>
                <span className="dropzone__spark">
                  <svg className="icon" aria-hidden="true"><use href="#i-sparkles" /></svg>
                </span>
                <span className="dropzone__chip">
                  <svg className="icon" aria-hidden="true"><use href="#i-scan" /></svg>
                  自动定位
                </span>
              </div>
              <h4>{dragActive ? "松开以上传文件" : "拖放车辆图片或视频"}</h4>
              <p>将文件拖到此处，或从本地选择。上传后可预览画面并一键开始识别。</p>
              <div className="dropzone__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => inputRef.current?.click()}
                  disabled={preparing}
                >
                  <svg className="icon" aria-hidden="true"><use href="#i-upload" /></svg>
                  选择本地文件
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={loadSample}
                  disabled={sampleLoading || preparing}
                >
                  {sampleLoading ? <span className="spinner" aria-hidden="true" /> : <svg className="icon" aria-hidden="true"><use href="#i-image" /></svg>}
                  使用示例图片
                </button>
              </div>
              <div className="dropzone__formats">
                <span>
                  <svg className="icon" aria-hidden="true"><use href="#i-image" /></svg>
                  JPG / PNG / WebP · 最大 {FILE_LIMITS.imageLabel}
                </span>
                <span>
                  <svg className="icon" aria-hidden="true"><use href="#i-film" /></svg>
                  MP4 / WebM / MOV · 最大 {FILE_LIMITS.videoLabel} / {FILE_LIMITS.videoDurationLabel}
                </span>
              </div>
            </div>
          ) : (
            <div className="preview-stage">
              <div className="preview-frame">
                {media.kind === "image" ? (
                  <img className="preview-media" src={media.url} alt={`待检测图片：${media.file.name}`} draggable="false" />
                ) : (
                  <video
                    ref={videoRef}
                    className="preview-media preview-media--video"
                    src={media.url}
                    controls
                    playsInline
                    preload="metadata"
                  >
                    当前浏览器不支持视频播放。
                  </video>
                )}

                {result?.media_type === "image" && overlayVisible ? (
                  <ImageOverlay detections={result.detections} activeDetectionId={activeDetectionId} />
                ) : null}
                {result?.media_type === "video" && overlayVisible ? (
                  <VideoOverlay videoRef={videoRef} timeline={result.timeline} visible={overlayVisible} />
                ) : null}

                {running ? (
                  <div className="scan-overlay">
                    <span className="scan-line" />
                    <span className="scan-status">
                      <span className="spinner spinner--light" aria-hidden="true" />
                      正在分析画面
                    </span>
                  </div>
                ) : null}

                {result ? (
                  <span className={`mode-flag ${result.mode === "demo" ? "mode-flag--demo" : "mode-flag--model"}`}>
                    {result.mode === "demo" ? "演示标注" : "模型标注"}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {preparing ? (
            <div className="preparing-overlay">
              <span className="spinner" aria-hidden="true" />
              正在读取文件信息
            </div>
          ) : null}

          {dragActive && media ? (
            <div className="drop-hint">
              <svg className="icon" aria-hidden="true"><use href="#i-upload" /></svg>
              <span>松开以替换当前文件</span>
            </div>
          ) : null}
        </div>

        {media ? (
          <div className="lab-file-meta">
            <span className="lab-file-meta__left">
              <span className="file-icon">
                <svg className="icon" aria-hidden="true"><use href={`#i-${media.kind === "image" ? "image" : "film"}`} /></svg>
              </span>
              <span className="file-name">{media.file.name}</span>
              <span className="file-size">{formatBytes(media.size)}</span>
            </span>
            <span className="lab-file-meta__right">
              {media.width} × {media.height}
              {media.kind === "video" && media.duration ? ` · ${formatDuration(media.duration)}` : ""}
              {result ? ` · 检出 ${result.summary.total} ${result.media_type === "video" ? "条轨迹" : "处"}` : ""}
            </span>
          </div>
        ) : null}
      </section>

      <aside className="lab-panel lab-controls" aria-label="识别设置">
        <div className="lab-panel__head">
          <div className="panel-title">
            <span className="panel-index">02</span>
            <h3>识别设置</h3>
          </div>
          {model?.mode === "demo" ? <span className="tag tag--demo">演示模式</span> : null}
          {model?.mode === "model" ? <span className="tag tag--success">模型就绪</span> : null}
          {serviceDown || modelUnavailable ? <span className="tag tag--error">服务异常</span> : null}
        </div>

        <div className="lab-controls__body">
          <div className="selected-file">
            <span className="selected-file__icon">
              <svg className="icon" aria-hidden="true"><use href={`#i-${media?.kind === "video" ? "film" : "image"}`} /></svg>
            </span>
            <span className="selected-file__text">
              <span className="field-kicker">{media ? (media.kind === "image" ? "待检测图片" : "待检测视频") : "当前文件"}</span>
              <strong>{media ? media.file.name : "尚未选择文件"}</strong>
            </span>
            {media ? <span className="pill">{media.kind === "image" ? "图片" : "视频"}</span> : null}
          </div>

          <div className="setting">
            <div className="setting__head">
              <div className="setting__label">
                <label htmlFor="confidence-threshold">置信度阈值</label>
                <InfoTip
                  id="confidence-threshold"
                  title="置信度阈值"
                  description="置信度表示模型对每个检测框的把握程度。后端只保留分数达到阈值的框：调高会更严格、减少低把握结果；调低会保留更多结果，也可能增加误检。"
                  arrow={68}
                />
              </div>
              <span className="value-chip">{formatPercent(settings.confidence, 0)}</span>
            </div>
            <input
              id="confidence-threshold"
              type="range"
              min="0.1"
              max="0.9"
              step="0.01"
              value={settings.confidence}
              disabled={running}
              onChange={(event) => updateSettings({ confidence: Number(event.target.value) })}
            />
            <div className="range-hints"><span>严格</span><span>宽松</span></div>
          </div>

          <div className="setting">
            <div className="setting__head">
              <div className="setting__label">
                <label htmlFor="iou-threshold">重叠抑制阈值</label>
                <InfoTip
                  id="iou-threshold"
                  title="重叠抑制阈值（IoU）"
                  description="IoU 是交并比，表示两个检测框的重叠程度。NMS 会抑制同类别中重叠超过阈值的低分框：调低更容易合并重复框，调高会保留更多重叠框。"
                  note="当前端到端模型通常已在模型内部完成候选筛选，此参数主要作为后端兜底。"
                  arrow={79}
                />
              </div>
              <span className="value-chip">{settings.iou.toFixed(2)}</span>
            </div>
            <input
              id="iou-threshold"
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={settings.iou}
              disabled={running}
              onChange={(event) => updateSettings({ iou: Number(event.target.value) })}
            />
            <div className="range-hints"><span>保留更多相邻目标</span><span>合并更多重叠框</span></div>
          </div>

          <div className="class-selector">
            <div className="class-selector__head">
              <span>识别类别</span>
              <small>以模型配置为准</small>
            </div>
            <div className="class-chips">
              {classes.map((item) => (
                <span className="class-chip" key={`${item.id}-${item.key}`}>
                  <i style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
              ))}
            </div>
          </div>

          {model?.mode === "demo" ? (
            <div className="notice notice--warning">
              <svg className="icon" aria-hidden="true"><use href="#i-flask" /></svg>
              <div>
                <strong>当前为演示模式</strong>
                <p>识别结果为模拟数据，仅用于体验流程。接入正式模型后将自动切换为真实推理。</p>
              </div>
            </div>
          ) : null}

          {serviceDown || modelUnavailable ? (
            <div className="notice notice--error">
              <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
              <div>
                <strong>{serviceDown ? "识别服务未连接" : "模型当前不可用"}</strong>
                <p>{serviceDown ? "请启动后端服务或检查接口地址配置后重试。" : model?.message}</p>
                <button type="button" className="text-link" onClick={onRetryModel}>
                  <svg className="icon" aria-hidden="true"><use href="#i-refresh" /></svg>
                  重新连接
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="notice notice--error" role="alert">
              <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
              <div>
                <strong>识别未完成</strong>
                <p>{error}</p>
              </div>
            </div>
          ) : null}

          {running ? (
            <div className="progress-panel" role="status" aria-live="polite">
              <div className="progress-panel__head">
                <span>{stage || "正在处理"}</span>
                <strong>{indeterminate ? "处理中" : `${Math.round(progress)}%`}</strong>
              </div>
              {indeterminate ? (
                <div className="progress progress--indeterminate"><span /></div>
              ) : (
                <progress className="progress" max="100" value={progress} />
              )}
              <p>
                {media?.kind === "video"
                  ? "视频会按关键帧逐段分析，完成后可在画面中查看动态标注。"
                  : "正在定位损伤区域，请保持页面开启。"}
              </p>
            </div>
          ) : null}

          {hasResult && !running ? (
            <div className="notice notice--success">
              <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
              <div>
                <strong>
                  识别完成，共检出 {result.summary.total} {result.media_type === "video" ? "条轨迹" : "处结果"}
                </strong>
                <a href="#result-panel" className="text-link">查看检测结果</a>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn--primary btn--block lab-run"
            onClick={runDetection}
            disabled={!canRun}
            aria-busy={running}
          >
            {running ? <span className="spinner spinner--light" aria-hidden="true" /> : hasResult ? (
              <svg className="icon" aria-hidden="true"><use href="#i-refresh" /></svg>
            ) : (
              <svg className="icon" aria-hidden="true"><use href="#i-scan" /></svg>
            )}
            {buttonLabel}
            {!running && canRun ? <svg className="icon" aria-hidden="true"><use href="#i-arrow-right" /></svg> : null}
          </button>

          <div className="lab-assurances">
            <span><svg className="icon" aria-hidden="true"><use href="#i-cpu" /></svg>服务端推理</span>
            <span><svg className="icon" aria-hidden="true"><use href="#i-lock" /></svg>原文件不长期保存</span>
          </div>

          {!media ? (
            <div className="mini-steps">
              <p className="field-kicker">三步完成检测</p>
              <ol>
                <li><span>01</span>上传车辆图片或视频</li>
                <li><span>02</span>调整参数并开始识别</li>
                <li><span>03</span>查看结果并导出报告</li>
              </ol>
            </div>
          ) : null}

          <p className="lab-disclaimer">检测结果仅供辅助判断，不替代专业定损、维修或理赔结论。</p>
        </div>
      </aside>
    </div>
  );
}
