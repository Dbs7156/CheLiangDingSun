"use client";

import { useState } from "react";
import { SITE } from "../data/site";

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatInferenceTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.max(1, Math.round(milliseconds))} 毫秒`;
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : fullDateFormatter.format(date);
}

function describeRegion(bbox) {
  const centerX = bbox.x + bbox.w / 2;
  const centerY = bbox.y + bbox.h / 2;
  const vertical = centerY < 0.33 ? "上" : centerY > 0.67 ? "下" : "中";
  const horizontal = centerX < 0.33 ? "左" : centerX > 0.67 ? "右" : "中";
  if (vertical === "中" && horizontal === "中") return "画面中央";
  if (horizontal === "中") return `画面${vertical}方`;
  if (vertical === "中") return `画面${horizontal}侧`;
  return `画面${horizontal}${vertical}区域`;
}

function safeDownloadName(name) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[\\/:*?"<>|\s]+/g, "-")
      .slice(0, 60) || "检测结果"
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function buildDonut(summary) {
  if (!summary.by_class.length || summary.total <= 0) {
    return "conic-gradient(#e2e8f0 0deg 360deg)";
  }
  let cursor = 0;
  const segments = summary.by_class.map((item) => {
    const start = cursor;
    const end = cursor + (item.count / summary.total) * 360;
    cursor = end;
    return `${item.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function downloadReport({ result, settings, model }) {
  const report = {
    report_name: "车辆受损检测报告",
    generated_at: new Date().toISOString(),
    demo_notice:
      result.mode === "demo"
        ? "演示模式：本报告中的检测框与置信度为模拟数据，不可作为真实定损或维修依据。"
        : null,
    media: {
      file_name: result.file_name,
      media_type: result.media_type,
      width: result.width,
      height: result.height,
      ...(result.media_type === "video"
        ? {
            duration_seconds: result.duration,
            fps: result.fps,
            sampled_fps: result.sampled_fps,
            frames_processed: result.frames_processed,
          }
        : {}),
    },
    settings: {
      confidence_threshold: settings.confidence,
      iou_threshold: settings.iou,
    },
    model: {
      name: result.model_name,
      mode: result.mode,
      engine: model?.engine || null,
      provider: model?.provider || null,
      classes: model?.classes || [],
    },
    summary: result.summary,
    ...(result.media_type === "image"
      ? { detections: result.detections }
      : { tracks: result.tracks, timeline: result.timeline }),
    disclaimer: "检测结果仅供辅助判断，不替代专业定损、维修或保险理赔结论。",
    created_at: result.created_at,
    inference_ms: result.inference_ms,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(blob, `${safeDownloadName(result.file_name)}-检测报告.json`);
}

async function downloadAnnotatedImage(result, imageUrl) {
  if (!imageUrl) throw new Error("当前结果没有可用的原图预览。");
  const image = new Image();
  image.decoding = "async";
  image.src = imageUrl;
  await image.decode();

  const maxDimension = 3000;
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * ratio);
  const height = Math.round(image.naturalHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持导出图片。");
  context.drawImage(image, 0, 0, width, height);

  const bannerHeight = Math.max(54, Math.round(height * 0.045));
  context.fillStyle = "rgba(7, 20, 39, 0.72)";
  context.fillRect(0, 0, width, bannerHeight);
  context.fillStyle = "#ffffff";
  context.font = `600 ${Math.max(16, Math.round(bannerHeight * 0.32))}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.textBaseline = "middle";
  context.fillText(`${SITE.name} · 检测结果`, 24, bannerHeight / 2);

  if (result.mode === "demo") {
    const tag = "演示模式";
    const fontSize = Math.max(14, Math.round(bannerHeight * 0.26));
    context.font = `500 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const textWidth = context.measureText(tag).width;
    const padX = 12;
    const tagHeight = fontSize + 12;
    const tagX = width - textWidth - padX * 2 - 24;
    const tagY = (bannerHeight - tagHeight) / 2;
    context.fillStyle = "rgba(245, 158, 11, 0.92)";
    roundedRect(context, tagX, tagY, textWidth + padX * 2, tagHeight, 8);
    context.fill();
    context.fillStyle = "#231404";
    context.fillText(tag, tagX + padX, bannerHeight / 2);
  }

  const lineWidth = Math.max(2, Math.round(width * 0.002));
  const labelFont = Math.max(13, Math.round(width * 0.0115));
  context.textBaseline = "alphabetic";
  result.detections.forEach((detection) => {
    const x = detection.bbox.x * width;
    const y = detection.bbox.y * height;
    const w = detection.bbox.w * width;
    const h = detection.bbox.h * height;
    const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;

    context.strokeStyle = detection.color;
    context.lineWidth = lineWidth;
    context.strokeRect(x, y, w, h);
    context.fillStyle = `${detection.color}18`;
    context.fillRect(x, y, w, h);

    context.font = `600 ${labelFont}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const labelWidth = context.measureText(label).width + 18;
    const labelHeight = labelFont + 14;
    const labelY = y - labelHeight >= bannerHeight ? y - labelHeight : y + 2;
    context.fillStyle = detection.color;
    roundedRect(context, x, labelY, labelWidth, labelHeight, 6);
    context.fill();
    context.fillStyle = "#ffffff";
    context.fillText(label, x + 9, labelY + labelHeight / 2 + 1);
  });

  const footerHeight = Math.max(38, Math.round(height * 0.035));
  context.fillStyle = "rgba(7, 20, 39, 0.68)";
  context.fillRect(0, height - footerHeight, width, footerHeight);
  context.fillStyle = "rgba(255,255,255,0.86)";
  context.font = `400 ${Math.max(12, Math.round(footerHeight * 0.32))}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  context.textBaseline = "middle";
  context.fillText("结果仅供辅助判断，不替代专业定损结论", 24, height - footerHeight / 2);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("导出标注图失败，请稍后重试。");
  triggerDownload(blob, `${safeDownloadName(result.file_name)}-标注图.jpg`);
}

function Stat({ icon, label, value, hint }) {
  return (
    <div className="result-stat">
      <span className="result-stat__label">
        <svg className="icon" aria-hidden="true"><use href={`#i-${icon}`} /></svg>
        {label}
      </span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export default function ResultCard({
  result,
  settings,
  model,
  imageUrl,
  videoRef,
  activeDetectionId,
  onActiveDetection,
}) {
  const [exportingImage, setExportingImage] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const imageResult = result.media_type === "image" ? result : null;
  const videoResult = result.media_type === "video" ? result : null;
  const empty = result.summary.total === 0;

  function handleReportDownload() {
    setExportError("");
    try {
      downloadReport({ result, settings, model });
      setExportNotice("检测报告已导出");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "报告导出失败。");
    }
  }

  async function handleImageDownload() {
    if (!imageResult) return;
    setExportingImage(true);
    setExportError("");
    try {
      await downloadAnnotatedImage(imageResult, imageUrl);
      setExportNotice("标注图已保存");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "标注图导出失败。");
    } finally {
      setExportingImage(false);
    }
  }

  function seekVideo(seconds) {
    const video = videoRef?.current;
    if (!video) return;
    video.currentTime = seconds;
    video.scrollIntoView({ behavior: "smooth", block: "center" });
    video.play().catch(() => {
      // If autoplay is blocked, the seeked frame is still visible.
    });
  }

  return (
    <section className="result-section" id="result-panel" aria-labelledby="result-title">
      {result.mode === "demo" ? (
        <div className="demo-disclaimer">
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
          <p>
            本结果由<strong>演示数据</strong>生成，仅用于体验交互与页面效果，不代表真实检测结论，也不可作为定损依据。
          </p>
        </div>
      ) : null}

      <div className="result-summary">
        <div className="result-summary__head">
          <div className="result-heading">
            <span className="result-heading__icon">
              <svg className="icon" aria-hidden="true"><use href={empty ? "#i-scan" : "#i-check"} /></svg>
            </span>
            <div>
              <div className="result-heading__title">
                <h3 id="result-title">{empty ? "本次未检出明显损伤" : "检测完成"}</h3>
                <span className={`tag ${result.mode === "demo" ? "tag--demo" : "tag--success"}`}>
                  {result.mode === "demo" ? "演示数据" : "模型结果"}
                </span>
              </div>
              <p>{result.model_name} · {formatDateTime(result.created_at)}</p>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={handleReportDownload}>
              <svg className="icon" aria-hidden="true"><use href="#i-download" /></svg>
              导出报告
            </button>
            {imageResult ? (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleImageDownload}
                disabled={exportingImage}
              >
                {exportingImage ? <span className="spinner" aria-hidden="true" /> : <svg className="icon" aria-hidden="true"><use href="#i-image" /></svg>}
                标注图
              </button>
            ) : null}
          </div>
        </div>

        {exportError || exportNotice ? (
          <p className={`export-message ${exportError ? "is-error" : ""}`} role="status">
            {exportError || exportNotice}
          </p>
        ) : null}

        <div className="result-summary__body">
          <div className="result-main">
            <div className="result-stats">
              <Stat
                icon="target"
                label={videoResult ? "检出轨迹" : "检出损伤"}
                value={
                  <>
                    {result.summary.total}
                    <span>{videoResult ? "个" : "处"}</span>
                  </>
                }
                hint={empty ? "可尝试降低置信度阈值" : "当前参数下的结果"}
              />
              <Stat
                icon="gauge"
                label="平均置信度"
                value={result.summary.total > 0 ? formatPercent(result.summary.average_confidence, 1) : "—"}
                hint={result.summary.total > 0 ? "检测目标均值" : "无有效目标"}
              />
              <Stat
                icon="clock"
                label="处理耗时"
                value={formatInferenceTime(result.inference_ms)}
                hint={`阈值 ${formatPercent(settings.confidence, 0)}`}
              />
            </div>

            <div className="distribution">
              <div className="distribution__head">
                <span>
                  <svg className="icon" aria-hidden="true"><use href="#i-layers" /></svg>
                  类别分布
                </span>
                {videoResult ? (
                  <small>{formatDuration(videoResult.duration)} · 每秒采样 {videoResult.sampled_fps} 帧</small>
                ) : (
                  <small>{imageResult.width} × {imageResult.height} 像素</small>
                )}
              </div>
              {result.summary.by_class.length ? (
                <div className="distribution__list">
                  {result.summary.by_class.map((item) => {
                    const ratio = result.summary.total > 0 ? item.count / result.summary.total : 0;
                    return (
                      <div className="distribution-row" key={item.class_key}>
                        <span className="distribution-row__name">{item.class_name}</span>
                        <span className="distribution-row__bar">
                          <i style={{ width: `${Math.max(4, ratio * 100)}%`, backgroundColor: item.color }} />
                        </span>
                        <span className="distribution-row__count">
                          {item.count}
                          <small>{videoResult ? "个" : "处"}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="distribution-empty">
                  <strong>当前阈值下没有检测到目标</strong>
                  <p>请尝试降低置信度阈值，或更换更清晰的图片/视频后重新识别。</p>
                </div>
              )}
            </div>
          </div>

          <aside className="result-side">
            <div className="distribution__head">
              <span><svg className="icon" aria-hidden="true"><use href="#i-chart" /></svg>结果构成</span>
              <small>{result.media_type === "image" ? "单图" : "视频汇总"}</small>
            </div>
            <div className="donut-row">
              <div className="donut" style={{ background: buildDonut(result.summary) }}>
                <span>
                  <strong>{result.summary.total}</strong>
                  <small>{videoResult ? "轨迹" : "损伤"}</small>
                </span>
              </div>
              <div className="donut-legend">
                {result.summary.by_class.length ? (
                  result.summary.by_class.slice(0, 5).map((item) => (
                    <div key={item.class_key}>
                      <span><i style={{ backgroundColor: item.color }} />{item.class_name}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))
                ) : (
                  <p>暂无类别数据</p>
                )}
              </div>
            </div>
            <dl className="result-meta">
              <div><dt>检测模式</dt><dd>{result.mode === "demo" ? "演示数据" : "正式模型"}</dd></div>
              <div><dt>文件类型</dt><dd>{result.media_type === "image" ? "图片" : "视频"}</dd></div>
              {videoResult ? <div><dt>分析帧数</dt><dd>{videoResult.frames_processed} 帧</dd></div> : null}
              <div><dt>参数快照</dt><dd>{formatPercent(settings.confidence, 0)} · {settings.iou.toFixed(2)}</dd></div>
            </dl>
          </aside>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card__head">
          <div>
            <h3>检测明细</h3>
            <p>
              {videoResult
                ? "按轨迹汇总，点击任一轨迹可定位到视频时间点"
                : "移动到任意一行可在画面中定位对应检测框"}
            </p>
          </div>
          <span className="tag tag--soft">
            {videoResult ? `${videoResult.tracks.length} 条轨迹` : `${imageResult.detections.length} 个目标`}
          </span>
        </div>

        {empty ? (
          <div className="empty-result">
            <svg className="icon" aria-hidden="true"><use href="#i-scan" /></svg>
            <strong>没有可展示的检测目标</strong>
            <p>当前参数下未检出目标。可以降低置信度阈值后重新识别，或更换清晰、光线充足的车辆画面。</p>
          </div>
        ) : imageResult ? (
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>目标</th>
                  <th>损伤类别</th>
                  <th>置信度</th>
                  <th>画面位置</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {imageResult.detections.map((detection, index) => (
                  <tr
                    key={detection.id}
                    className={activeDetectionId === detection.id ? "is-active" : ""}
                    onMouseEnter={() => onActiveDetection(detection.id)}
                    onMouseLeave={() => onActiveDetection(null)}
                  >
                    <td className="mono">{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <span className="class-cell">
                        <i style={{ backgroundColor: detection.color }} />
                        {detection.class_name}
                      </span>
                    </td>
                    <td>
                      <span className="confidence-cell">
                        <strong>{formatPercent(detection.confidence, 1)}</strong>
                        <span><i style={{ width: `${Math.max(4, detection.confidence * 100)}%`, backgroundColor: detection.color }} /></span>
                      </span>
                    </td>
                    <td className="muted">{describeRegion(detection.bbox)}</td>
                    <td>
                      <button type="button" className="text-link" onClick={() => onActiveDetection(detection.id)}>
                        <svg className="icon" aria-hidden="true"><use href="#i-target" /></svg>
                        定位
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="detail-cards">
              {imageResult.detections.map((detection, index) => (
                <button
                  type="button"
                  key={detection.id}
                  className="detail-mini-card"
                  onClick={() => onActiveDetection(detection.id)}
                >
                  <span className="detail-mini-card__index" style={{ backgroundColor: detection.color }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{detection.class_name}</strong>
                    <small>{describeRegion(detection.bbox)} · {formatPercent(detection.confidence, 1)}</small>
                  </span>
                  <svg className="icon" aria-hidden="true"><use href="#i-target" /></svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>轨迹</th>
                  <th>损伤类别</th>
                  <th>峰值置信度</th>
                  <th>出现时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {videoResult.tracks.map((track) => (
                  <tr key={track.id}>
                    <td className="mono">T{String(track.id).padStart(2, "0")}</td>
                    <td>
                      <span className="class-cell">
                        <i style={{ backgroundColor: track.color }} />
                        {track.class_name}
                      </span>
                    </td>
                    <td className="mono strong">{formatPercent(track.confidence, 1)}</td>
                    <td className="mono muted">
                      {formatDuration(track.first_seen)} <span className="dash">—</span> {formatDuration(track.last_seen)}
                    </td>
                    <td>
                      <button type="button" className="text-link" onClick={() => seekVideo(track.first_seen)}>
                        <svg className="icon" aria-hidden="true"><use href="#i-arrow-up-right" /></svg>
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="detail-cards">
              {videoResult.tracks.map((track) => (
                <button key={track.id} type="button" className="detail-mini-card" onClick={() => seekVideo(track.first_seen)}>
                  <span className="detail-mini-card__index detail-mini-card__index--square" style={{ backgroundColor: track.color }}>
                    {track.id}
                  </span>
                  <span>
                    <strong>{track.class_name}</strong>
                    <small>出现于 {formatDuration(track.first_seen)} · {formatPercent(track.confidence, 1)}</small>
                  </span>
                  <svg className="icon" aria-hidden="true"><use href="#i-arrow-up-right" /></svg>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="detail-card__foot">
          <p>{result.mode === "demo" ? "演示结果不可用于真实业务判断。" : "结果由检测模型生成，建议结合人工复核。"}</p>
          <span>{result.media_type === "video" ? "时间轴标注" : "报告可导出"}</span>
        </div>
      </div>
    </section>
  );
}
