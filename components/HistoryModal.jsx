"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, SITE } from "../data/site";

const relativeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : fullDateFormatter.format(date);
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const now = new Date();
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return relativeFormatter.format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${relativeFormatter.format(date)}`;
  }
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function truncate(name, max = 34) {
  if (!name || name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  return `${name.slice(0, Math.max(8, max - extension.length - 1))}…${extension}`;
}

async function errorFromResponse(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return new Error(body.detail);
    if (Array.isArray(body.detail) && body.detail[0]?.msg) return new Error(String(body.detail[0].msg));
  } catch {
    // Fall back to a status message.
  }
  return new Error(`请求失败（${response.status}）`);
}

async function fetchHistory(signal) {
  const response = await fetch(`${API_BASE_URL}/api/history?limit=20`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
  return response.json();
}

async function clearHistory(signal) {
  const response = await fetch(`${API_BASE_URL}/api/history`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await errorFromResponse(response);
}

function Thumbnail({ record, large = false }) {
  const [failed, setFailed] = useState(false);
  const source = record.thumbnail_url ? `${API_BASE_URL}${record.thumbnail_url}` : null;
  return (
    <span className={`history-thumb ${large ? "history-thumb--large" : ""}`}>
      {source && !failed ? (
        <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="history-thumb__fallback">
          <svg className="icon" aria-hidden="true"><use href={`#i-${record.media_type === "video" ? "film" : "image"}`} /></svg>
          {large ? "缩略图不可用" : null}
        </span>
      )}
      <span className="history-thumb__type">
        <svg className="icon" aria-hidden="true"><use href={`#i-${record.media_type === "video" ? "film" : "image"}`} /></svg>
        {record.media_type === "video" ? "视频" : "图片"}
      </span>
      {record.mode === "demo" ? <span className="history-thumb__demo">演示</span> : null}
    </span>
  );
}

function RecordDetail({ record, onBack }) {
  const stats = [
    {
      label: record.media_type === "video" ? "检出轨迹" : "检出损伤",
      value: record.summary.total,
      suffix: record.media_type === "video" ? "个" : "处",
    },
    {
      label: "平均置信度",
      value: record.summary.total ? formatPercent(record.summary.average_confidence) : "—",
      suffix: "",
    },
    {
      label: "文件尺寸",
      value: record.width && record.height ? `${record.width} × ${record.height}` : "—",
      suffix: "",
    },
  ];

  return (
    <div className="history-detail">
      <button type="button" className="back-link" onClick={onBack}>
        <svg className="icon" aria-hidden="true"><use href="#i-chevron-left" /></svg>
        返回列表
      </button>

      <Thumbnail record={record} large />
      <div className="history-detail__title">
        <div>
          <h4>{record.file_name}</h4>
          <p>
            {formatDateTime(record.created_at)}
            {record.duration ? ` · ${formatDuration(record.duration)}` : ""}
          </p>
        </div>
        <span className={`tag ${record.mode === "demo" ? "tag--demo" : "tag--success"}`}>
          {record.mode === "demo" ? "演示数据" : "模型结果"}
        </span>
      </div>

      <div className="history-stat-grid">
        {stats.map((item) => (
          <div className="history-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}<small>{item.suffix}</small></strong>
          </div>
        ))}
      </div>

      <div className="history-classes">
        <div className="history-classes__head">
          <span>类别分布</span>
          <small>{record.model_name}</small>
        </div>
        {record.summary.by_class.length ? (
          record.summary.by_class.map((item) => (
            <div className="history-class-row" key={item.class_key}>
              <span><i style={{ backgroundColor: item.color }} />{item.class_name}</span>
              <span className="history-class-bar">
                <i
                  style={{
                    width: `${Math.max(5, (item.count / Math.max(1, record.summary.total)) * 100)}%`,
                    backgroundColor: item.color,
                  }}
                />
              </span>
              <strong>{item.count}</strong>
            </div>
          ))
        ) : (
          <p className="history-empty-line">未检出目标</p>
        )}
      </div>

      <div className="notice notice--neutral history-note">
        <svg className="icon" aria-hidden="true"><use href="#i-lock" /></svg>
        <p>原始图片或视频未长期保存，仅保留缩略图与检测摘要。该记录将在创建 30 天后自动清理。</p>
      </div>

      {record.mode === "demo" ? (
        <div className="notice notice--warning history-note">
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
          <p>这是演示模式下生成的模拟结果，不可用于真实定损或理赔判断。</p>
        </div>
      ) : null}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="history-loading">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="history-skeleton" key={index}>
          <span />
          <div>
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HistoryModal({ open, onClose }) {
  const dialogRef = useRef(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [retentionDays, setRetentionDays] = useState(SITE.retentionDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setConfirmClear(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchHistory(controller.signal)
      .then((data) => {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setRetentionDays(data.retention_days || SITE.retentionDays);
      })
      .catch((historyError) => {
        if (historyError.name !== "AbortError") {
          setError(historyError.message || "记录加载失败。");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, reloadKey]);

  async function handleClear() {
    setClearing(true);
    setError("");
    try {
      await clearHistory();
      setItems([]);
      setTotal(0);
      setConfirmClear(false);
      setSelected(null);
    } catch (clearError) {
      setError(clearError.message || "清空记录失败。");
    } finally {
      setClearing(false);
    }
  }

  function handleDialogClick(event) {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      dialog.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="history-dialog"
      aria-labelledby="history-title"
      onClose={onClose}
      onClick={handleDialogClick}
    >
      <div className="history-dialog__head">
        <div>
          <span className="dialog-kicker">
            <svg className="icon" aria-hidden="true"><use href="#i-history" /></svg>
            历史归档
          </span>
          <h3 id="history-title">{selected ? "检测记录详情" : "检测记录"}</h3>
          <p>仅显示当前会话记录，保留 {retentionDays} 天</p>
        </div>
        <button type="button" className="icon-button" aria-label="关闭检测记录" onClick={() => dialogRef.current?.close()}>
          <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>

      <div className="history-dialog__body">
        {selected ? (
          <RecordDetail record={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="history-toolbar">
              <p className="session-note">
                <svg className="icon" aria-hidden="true"><use href="#i-shield" /></svg>
                记录与当前浏览器会话绑定，清除浏览器数据后将无法找回。
              </p>
              {items.length > 0 ? (
                <button type="button" className="text-link text-link--danger" onClick={() => setConfirmClear(true)}>
                  <svg className="icon" aria-hidden="true"><use href="#i-trash" /></svg>
                  清空
                </button>
              ) : null}
            </div>

            {confirmClear ? (
              <div className="confirm-box">
                <div>
                  <strong>清空全部检测记录？</strong>
                  <p>将删除当前会话下的所有检测摘要与缩略图，此操作不可撤销，原始文件不受影响。</p>
                </div>
                <div className="confirm-box__actions">
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => setConfirmClear(false)}>
                    取消
                  </button>
                  <button type="button" className="btn btn--danger btn--sm" onClick={handleClear} disabled={clearing}>
                    {clearing ? <span className="spinner spinner--light" aria-hidden="true" /> : null}
                    确认清空
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="notice notice--error">
                <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
                <div>
                  <strong>记录加载失败</strong>
                  <p>{error}</p>
                  <button type="button" className="text-link" onClick={() => setReloadKey((key) => key + 1)}>
                    <svg className="icon" aria-hidden="true"><use href="#i-refresh" /></svg>
                    重新加载
                  </button>
                </div>
              </div>
            ) : loading ? (
              <LoadingRows />
            ) : items.length === 0 ? (
              <div className="history-empty">
                <span><svg className="icon" aria-hidden="true"><use href="#i-history" /></svg></span>
                <strong>还没有检测记录</strong>
                <p>完成一次图片或视频检测后，结果缩略图与摘要会自动保存在这里。</p>
              </div>
            ) : (
              <div className="history-list">
                {items.map((record) => (
                  <button
                    type="button"
                    className="history-item"
                    key={record.id}
                    onClick={() => setSelected(record)}
                  >
                    <Thumbnail record={record} />
                    <span className="history-item__body">
                      <span className="history-item__title">
                        {truncate(record.file_name)}
                        {record.mode === "demo" ? <em>演示</em> : null}
                      </span>
                      <span className="history-item__meta">
                        {formatRelativeDate(record.created_at)}
                        <i>·</i>
                        {record.summary.total} {record.media_type === "video" ? "个轨迹" : "处结果"}
                        {record.summary.total > 0 ? (
                          <>
                            <i>·</i>
                            {formatPercent(record.summary.average_confidence, 0)}
                          </>
                        ) : null}
                      </span>
                      <span className="history-item__classes">
                        {record.summary.by_class.slice(0, 3).map((item) => (
                          <span key={item.class_key}>
                            <i style={{ backgroundColor: item.color }} />
                            {item.class_name}
                          </span>
                        ))}
                      </span>
                    </span>
                    <svg className="icon history-item__arrow" aria-hidden="true"><use href="#i-chevron-right" /></svg>
                  </button>
                ))}
                <p className="history-total">
                  <svg className="icon" aria-hidden="true"><use href="#i-lock" /></svg>
                  共 {total} 条 · 到期自动清理
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
