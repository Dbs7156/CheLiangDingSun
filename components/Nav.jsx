"use client";

import { useEffect, useRef, useState } from "react";
import { NAV_ITEMS, SITE } from "../data/site";

function statusInfo(model, loading, error) {
  if (loading) {
    return {
      label: "正在连接",
      modifier: "loading",
      description: "正在连接识别服务。",
    };
  }
  if (error || !model) {
    return {
      label: "服务未连接",
      modifier: "offline",
      description: "无法连接识别服务，请确认后端已启动。",
    };
  }
  if (model.mode === "model") {
    return {
      label: "模型已就绪",
      modifier: "ready",
      description: model.message || "检测模型已加载，推理服务就绪。",
    };
  }
  if (model.mode === "unavailable") {
    return {
      label: "模型异常",
      modifier: "error",
      description: model.message || "检测模型当前不可用。",
    };
  }
  return {
    label: "演示模式",
    modifier: "demo",
    description: model.message || "当前结果由模拟数据生成。",
  };
}

export default function Nav({ model, modelLoading, modelError, onOpenHistory }) {
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const status = statusInfo(model, modelLoading, modelError);

  useEffect(() => {
    const dialog = menuRef.current;
    if (!dialog) return;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
  }, [menuOpen]);

  function openMenu() {
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleBackdropClick(event) {
    if (event.target === menuRef.current) closeMenu();
  }

  function openHistory() {
    closeMenu();
    onOpenHistory();
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href="#top" aria-label={`${SITE.name}首页`}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="presentation">
              <rect width="48" height="48" rx="13" fill="url(#brand-gradient)" />
              <defs>
                <linearGradient id="brand-gradient" x1="6" y1="3" x2="42" y2="46" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563eb" />
                  <stop offset="0.55" stopColor="#0b1f3a" />
                  <stop offset="1" stopColor="#123665" />
                </linearGradient>
              </defs>
              <path
                d="M13 18v-3a2 2 0 0 1 2-2h3M30 13h3a2 2 0 0 1 2 2v3M35 30v3a2 2 0 0 1-2 2h-3M18 35h-3a2 2 0 0 1-2-2v-3"
                fill="none"
                stroke="#fff"
                strokeWidth="1.7"
                strokeLinecap="round"
                opacity="0.5"
              />
              <path d="M16 29h16l-1.5-5h-13L16 29Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="m20 24 1.3-3h5.4l1.3 3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M15.8 29h16.4v3.2H15.8z" fill="#fff" opacity="0.92" />
              <circle cx="19.4" cy="33" r="1.7" fill="#0b1f3a" stroke="#fff" strokeWidth="1.2" />
              <circle cx="28.6" cy="33" r="1.7" fill="#0b1f3a" stroke="#fff" strokeWidth="1.2" />
              <circle cx="36" cy="14" r="2.2" fill="#5eead4" />
            </svg>
          </span>
          <span className="brand-text">
            <span className="brand-name">{SITE.name}</span>
            <span className="brand-sub">车辆受损智能识别</span>
          </span>
        </a>

        <nav className="nav-links" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} className="nav-link" href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <span
            className={`status-pill status-pill--${status.modifier}`}
            title={status.description}
          >
            <span className="status-dot" aria-hidden="true" />
            {status.label}
          </span>

          <button type="button" className="btn btn--secondary btn--sm header-history" onClick={openHistory}>
            <svg className="icon" aria-hidden="true"><use href="#i-history" /></svg>
            检测记录
          </button>
          <a className="btn btn--primary btn--sm header-start" href="#workspace">
            开始检测
            <svg className="icon" aria-hidden="true"><use href="#i-arrow-up-right" /></svg>
          </a>

          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="检测记录"
            onClick={openHistory}
          >
            <svg className="icon" aria-hidden="true"><use href="#i-history" /></svg>
          </button>
          <button
            type="button"
            className="icon-button mobile-only"
            aria-label="打开菜单"
            aria-expanded={menuOpen}
            onClick={openMenu}
          >
            <svg className="icon" aria-hidden="true"><use href="#i-menu" /></svg>
          </button>
        </div>
      </div>

      <dialog
        ref={menuRef}
        className="mobile-menu"
        aria-label="移动端导航"
        onClose={() => setMenuOpen(false)}
        onClick={handleBackdropClick}
      >
        <div className="mobile-menu__panel">
          <div className="mobile-menu__head">
            <span className="brand brand--menu">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" role="presentation">
                  <rect width="48" height="48" rx="13" fill="#0b1f3a" />
                  <path d="M16 29h16l-1.5-5h-13L16 29Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="m20 24 1.3-3h5.4l1.3 3" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M15.8 29h16.4v3.2H15.8z" fill="#fff" opacity="0.92" />
                  <circle cx="19.4" cy="33" r="1.7" fill="#0b1f3a" stroke="#fff" strokeWidth="1.2" />
                  <circle cx="28.6" cy="33" r="1.7" fill="#0b1f3a" stroke="#fff" strokeWidth="1.2" />
                  <circle cx="36" cy="14" r="2.2" fill="#5eead4" />
                </svg>
              </span>
              <span className="brand-text">
                <span className="brand-name">{SITE.name}</span>
                <span className="brand-sub">车辆受损智能识别</span>
              </span>
            </span>
            <button type="button" className="icon-button" aria-label="关闭菜单" onClick={closeMenu}>
              <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
            </button>
          </div>

          <div className={`status-pill status-pill--${status.modifier} mobile-menu__status`}>
            <span className="status-dot" aria-hidden="true" />
            {status.label}
          </div>

          <nav className="mobile-menu__links" aria-label="移动端主导航">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                <span>{item.label}</span>
                <span className="mobile-menu__number">{item.number}</span>
              </a>
            ))}
          </nav>

          <div className="mobile-menu__actions">
            <a className="btn btn--primary" href="#workspace" onClick={closeMenu}>
              开始检测
              <svg className="icon" aria-hidden="true"><use href="#i-arrow-up-right" /></svg>
            </a>
            <button className="btn btn--secondary" type="button" onClick={openHistory}>
              <svg className="icon" aria-hidden="true"><use href="#i-history" /></svg>
              查看检测记录
            </button>
          </div>

          <p className="mobile-menu__note">检测结果仅供辅助参考，不替代专业定损结论。</p>
        </div>
      </dialog>
    </header>
  );
}
