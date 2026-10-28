"use client";

import { useEffect, useRef, useState } from "react";
import AnimatedCardGrid from "./AnimatedCardGrid";
import HistoryModal from "./HistoryModal";
import InputCard from "./InputCard";
import Nav from "./Nav";
import PageHeading from "./PageHeading";
import ResultCard from "./ResultCard";
import {
  API_BASE_URL,
  CAPABILITIES,
  DATASET_FACTS,
  DATASET_SOURCE,
  HERO_DETECTIONS,
  NAV_ITEMS,
  SAMPLE_CLASS_COUNTS,
  SCENARIOS,
  SITE,
  TRUST_ITEMS,
  WORKFLOW_STEPS,
} from "../data/site";

function Icon({ name }) {
  return <svg className="icon" aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

function HeroPreview() {
  return (
    <div className="hero-visual">
      <div className="hero-glow" aria-hidden="true" />
      <div className="preview-card">
        <div className="preview-card__head">
          <div className="preview-card__title">
            <span className="preview-card__icon"><Icon name="target" /></span>
            <div>
              <strong>车辆损伤识别</strong>
              <small>单图检测 · 标注预览</small>
            </div>
          </div>
          <span className="tag tag--soft">示例画面</span>
        </div>

        <div className="preview-card__image-wrap">
          <div className="preview-card__image">
            <img src={SITE.sampleImage} alt="示例车辆侧面视图" />
            <span className="preview-card__gradient" aria-hidden="true" />
            <span className="preview-card__scan" aria-hidden="true" />
            {HERO_DETECTIONS.map((detection, index) => (
              <span
                className="hero-detection"
                key={detection.id}
                style={{
                  ...detection.style,
                  borderColor: detection.color,
                  background: `${detection.color}15`,
                  animationDelay: `${0.4 + index * 0.16}s`,
                }}
              >
                <span
                  className={`hero-detection__label ${detection.labelAbove ? "hero-detection__label--above" : "hero-detection__label--below"}`}
                  style={{ backgroundColor: detection.color }}
                >
                  {detection.name}
                  <small>{detection.confidence}%</small>
                </span>
              </span>
            ))}
            <span className="preview-card__status">
              <i aria-hidden="true" />
              示例标注已生成
            </span>
          </div>
        </div>

        <div className="preview-card__foot">
          <div>
            <small>示例识别结果</small>
            <strong>发现 <em>3 处</em> 疑似损伤</strong>
          </div>
          <span className="color-dots" aria-hidden="true">
            <i style={{ background: "#0d9488" }} />
            <i style={{ background: "#2563eb" }} />
            <i style={{ background: "#e11d48" }} />
          </span>
        </div>
      </div>

      <div className="floating-card floating-card--score">
        <div className="floating-card__head">
          <span>平均置信度</span>
          <small>样例</small>
        </div>
        <div className="floating-card__score">
          <strong>85.0</strong>
          <span>%</span>
          <span className="mini-bars" aria-hidden="true">
            {[38, 52, 46, 68, 61, 78, 88].map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </span>
        </div>
      </div>

      <div className="floating-card floating-card--done">
        <span><Icon name="check" /></span>
        定位与分类完成
      </div>
    </div>
  );
}

function CapabilityVisual({ type }) {
  if (type === "classes") {
    return (
      <div className="capability-visual capability-visual--classes">
        <div className="mini-panel__head"><span>类别检出</span><small>示例</small></div>
        {SAMPLE_CLASS_COUNTS.map((item) => (
          <div className="mini-class-row" key={item.id}>
            <i style={{ backgroundColor: item.color }} />
            <span>{item.name}</span>
            <span className="mini-class-bar"><i style={{ width: `${item.width}%`, backgroundColor: item.color }} /></span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    );
  }
  if (type === "timeline") {
    return (
      <div className="capability-visual capability-visual--timeline">
        <div className="mini-panel__head">
          <span><Icon name="play" />时间轴标注</span>
          <small>00:18</small>
        </div>
        <div className="mini-timeline">
          <span className="mini-timeline__axis" />
          <span className="mini-timeline__bar mini-timeline__bar--one" />
          <span className="mini-timeline__bar mini-timeline__bar--two" />
          <span className="mini-timeline__bar mini-timeline__bar--three" />
          <span className="mini-timeline__playhead" />
        </div>
        <div className="mini-timeline__labels"><span>00:00</span><span>00:09</span><span>00:18</span></div>
      </div>
    );
  }
  return (
    <div className="capability-visual capability-visual--records">
      {[
        { title: "车辆前部检测", meta: "2 分钟前 · 图片", tone: "blue" },
        { title: "车辆侧身巡检", meta: "今天 14:26 · 视频", tone: "green" },
      ].map((record) => (
        <div className="mini-record" key={record.title}>
          <span className={`mini-record__thumb mini-record__thumb--${record.tone}`} />
          <span><strong>{record.title}</strong><small>{record.meta}</small></span>
          <i />
        </div>
      ))}
    </div>
  );
}

export default function HomeView() {
  const [model, setModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [appliedSettings, setAppliedSettings] = useState({ confidence: 0.35, iou: 0.45 });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeDetectionId, setActiveDetectionId] = useState(null);
  const modelControllerRef = useRef(null);
  const videoRef = useRef(null);

  async function refreshModelStatus() {
    modelControllerRef.current?.abort();
    const controller = new AbortController();
    modelControllerRef.current = controller;
    setModelLoading(true);
    setModelError(false);
    try {
      const response = await fetch(`${API_BASE_URL}/api/model`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) throw new Error("模型状态接口返回异常。");
      const data = await response.json();
      if (!controller.signal.aborted) {
        setModel(data);
        setModelError(false);
      }
    } catch (error) {
      if (error.name !== "AbortError" && !controller.signal.aborted) {
        setModel(null);
        setModelError(true);
      }
    } finally {
      if (!controller.signal.aborted) setModelLoading(false);
    }
  }

  useEffect(() => {
    refreshModelStatus();
    return () => modelControllerRef.current?.abort();
  }, []);

  function handleResult(nextResult, settings, url) {
    setResult(nextResult);
    setAppliedSettings(settings);
    setPreviewUrl(url);
    setActiveDetectionId(null);
  }

  function handleClearResult() {
    setResult(null);
    setPreviewUrl(null);
    setActiveDetectionId(null);
  }

  const isDemo = model?.mode === "demo";

  return (
    <div id="top" className="site-shell">
      <a className="skip-link" href="#workspace">跳到智能检测台</a>
      <Nav
        model={model}
        modelLoading={modelLoading}
        modelError={modelError}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-background" aria-hidden="true">
            <span className="hero-grid" />
            <span className="hero-blur hero-blur--one" />
            <span className="hero-blur hero-blur--two" />
          </div>
          <div className="container">
            <div className="hero-grid-layout">
              <div className="hero-copy">
                <span className="eyebrow-pill">
                  <strong><Icon name="sparkles" />智能视觉识别</strong>
                  图片与视频双模式检测
                </span>
                <h1 id="hero-title" className="hero-title">
                  每一处车损，
                  <br />
                  <span className="hero-title__gradient">
                    都清晰可见。
                    <svg viewBox="0 0 320 12" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M2 8.5C79 3 205 2 318 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </span>
                </h1>
                <p className="hero-lead">
                  上传车辆图片或视频，自动完成损伤定位与类别识别。标记框、置信度与检测结果同屏呈现，让每一次判断都有据可依。
                </p>
                <div className="hero-actions">
                  <a className="btn btn--primary btn--lg" href="#workspace">
                    <Icon name="scan" />
                    上传并开始检测
                    <Icon name="arrow-right" />
                  </a>
                  <a className="btn btn--secondary btn--lg" href="#capabilities">了解检测能力</a>
                </div>
                <ul className="hero-checks">
                  <li><Icon name="check" />无需安装客户端</li>
                  <li><Icon name="check" />支持主流图片与视频格式</li>
                  <li><Icon name="check" />结果可导出</li>
                </ul>
              </div>
              <HeroPreview />
            </div>

            <div className="hero-trust">
              <p><span aria-hidden="true" />面向真实车损业务场景</p>
              <div>
                {TRUST_ITEMS.map((item) => (
                  <span className="trust-item" key={item.title}>
                    <span className="trust-item__icon"><Icon name={item.icon} /></span>
                    <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="workspace" className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-blur workspace-blur--one" aria-hidden="true" />
          <div className="workspace-blur workspace-blur--two" aria-hidden="true" />
          <div className="container workspace-inner">
            <div className="workspace-heading">
              <PageHeading
                eyebrow="智能检测工作台"
                title={<span id="workspace-title">上传车辆画面，开始识别</span>}
                description="图片或视频均可检测，结果会直接标注在原始画面上。识别类别会随接入的检测模型自动更新。"
              />
              <div className="workspace-badges">
                <span><Icon name="scan" />图片 / 视频双模式</span>
                <span><Icon name="shield" />记录留存 {SITE.retentionDays} 天</span>
                {isDemo ? <span className="workspace-badges__demo"><Icon name="flask" />当前为演示模式</span> : null}
              </div>
            </div>

            <AnimatedCardGrid>
              <InputCard
                model={model}
                modelLoading={modelLoading}
                modelError={modelError}
                onRetryModel={refreshModelStatus}
                result={result}
                activeDetectionId={activeDetectionId}
                onActiveDetection={setActiveDetectionId}
                onResult={handleResult}
                onClearResult={handleClearResult}
                videoRef={videoRef}
              />
            </AnimatedCardGrid>

            {result ? (
              <ResultCard
                result={result}
                settings={appliedSettings}
                model={model}
                imageUrl={previewUrl}
                videoRef={videoRef}
                activeDetectionId={activeDetectionId}
                onActiveDetection={setActiveDetectionId}
              />
            ) : null}

            <div className="workspace-footnote">
              <span><Icon name="download" />支持导出检测报告{result?.media_type === "image" ? "与标注图片" : ""}</span>
              <span>检测结果仅供参考，不替代人工复核与专业定损。</span>
            </div>
          </div>
        </section>

        <section id="capabilities" className="capabilities section">
          <div className="container">
            <div className="section-heading-row">
              <PageHeading
                eyebrow="检测能力"
                title={<>从上传到复核，<br className="desktop-break" />每一步都有据可查</>}
                description="围绕车辆视觉检测的真实工作流设计：定位损伤、呈现置信度、标记视频时间轴，并将结果整理成可回看的检测记录。"
              />
              <div className="capability-tags">
                <span><Icon name="image" />图片检测</span>
                <span><Icon name="film" />视频检测</span>
                <span><Icon name="history" />记录留存</span>
              </div>
            </div>

            <div className="capability-grid">
              {CAPABILITIES.map((capability) => (
                <article className={`capability-card capability-card--${capability.visual}`} key={capability.id}>
                  <div className="capability-card__head">
                    <span className="feature-icon"><Icon name={capability.icon} /></span>
                    <span className="card-number">{capability.id}</span>
                  </div>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                  <CapabilityVisual type={capability.visual} />
                </article>
              ))}
            </div>

            <div className="scenario-bar">
              <div className="scenario-bar__title">
                <span><Icon name="sparkles" /></span>
                <div><strong>适配多种车损业务场景</strong><small>同一套检测流程，覆盖查勘、评估、接车与巡检</small></div>
              </div>
              <div className="scenario-list">
                {SCENARIOS.map((scenario) => (
                  <span key={scenario.title}><Icon name={scenario.icon} />{scenario.title}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="workflow section">
          <div className="workflow-grid-bg" aria-hidden="true" />
          <div className="container workflow-layout">
            <div className="workflow-copy">
              <PageHeading
                eyebrow="使用流程"
                title={<>三步完成一次<br />车辆受损检测</>}
                description="无需安装额外软件，所有操作都在浏览器内完成。图片与视频共用同一套清晰流程。"
              />
              <div className="workflow-metrics">
                <div><Icon name="clock" /><strong>3 分钟</strong><small>单个视频时长上限</small></div>
                <div><Icon name="chart" /><strong>动态标注</strong><small>视频按采样帧分析</small></div>
              </div>
              <a className="btn btn--primary" href="#workspace">立即开始检测<Icon name="arrow-right" /></a>
            </div>

            <div className="workflow-steps">
              {WORKFLOW_STEPS.map((step) => (
                <article className="workflow-step" key={step.number}>
                  <div className="workflow-step__icon">
                    <span><Icon name={step.icon} /></span>
                    <em>{step.number}</em>
                  </div>
                  <div>
                    <div className="workflow-step__head">
                      <h3>{step.title}</h3>
                      <span>{step.meta}</span>
                    </div>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="dataset" className="dataset-section section">
          <div className="container">
            <div className="dataset-card">
              <div className="dataset-rings" aria-hidden="true"><span /><span /><span /></div>
              <div className="dataset-content">
                <span className="dataset-kicker"><Icon name="database" />训练数据来源</span>
                <h2>模型看见的每一处损伤，<br />都来自真实车损数据。</h2>
                <p className="dataset-lead">
                  当前车辆受损检测模型使用 <strong>{DATASET_SOURCE.name}</strong>
                  （{DATASET_SOURCE.fullName}）训练。该数据集由
                  {DATASET_SOURCE.institution}的研究团队构建，为模型的类别学习与位置定位提供真实车损数据基础。
                </p>
                <div className="dataset-grid">
                  {DATASET_FACTS.map((fact) => (
                    <div key={fact.label}>
                      <Icon name={fact.icon} />
                      <strong>{fact.value}</strong>
                      <small>{fact.label}</small>
                    </div>
                  ))}
                </div>
                <div className="dataset-actions">
                  <a
                    className="btn btn--light btn--lg"
                    href={DATASET_SOURCE.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看 CarDD 数据集<Icon name="arrow-up-right" />
                  </a>
                  <a
                    className="dataset-paper-link"
                    href={DATASET_SOURCE.paperUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    阅读数据集论文<Icon name="arrow-up-right" />
                  </a>
                </div>
                <p className="dataset-citation">{DATASET_SOURCE.citation}</p>
                <p className="dataset-note">
                  <Icon name="shield" />
                  <span>网站上传的图片与视频仅用于当次检测，不用于模型训练；CarDD 版权归原作者所有，数据使用遵循官方许可说明。</span>
                </p>
              </div>
              <div className="dataset-visual" aria-hidden="true">
                <span className="dataset-orbit dataset-orbit--one" />
                <span className="dataset-orbit dataset-orbit--two" />
                <span className="dataset-orbit dataset-orbit--three" />
                <div className="dataset-core">
                  <span className="dataset-core__icon"><Icon name="database" /></span>
                  <strong>CarDD</strong>
                  <small>车辆损伤检测数据集</small>
                  <span className="dataset-core__meta">4,000 图像 · 6 类损伤</span>
                </div>
                <span className="dataset-tag"><i />IEEE T-ITS · 2023</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a className="brand" href="#top">
                <span className="brand-mark brand-mark--small" aria-hidden="true">
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
                <span className="brand-text"><span className="brand-name">{SITE.name}</span><span className="brand-sub">车辆受损智能识别</span></span>
              </a>
              <p>面向车辆受损识别场景的智能检测工具。上传图片或视频，快速查看损伤位置与检测结果。</p>
              <div className="footer-status">
                <span className={`status-pill status-pill--${isDemo ? "demo" : modelError ? "offline" : model?.mode === "model" ? "ready" : "error"}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {isDemo ? "演示模式" : model?.mode === "model" ? "模型已就绪" : modelError || !model ? "服务未连接" : "模型异常"}
                </span>
                <span className="pill">记录保留 {SITE.retentionDays} 天</span>
              </div>
            </div>

            <div className="footer-column">
              <h4>页面导航</h4>
              {NAV_ITEMS.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
            </div>
            <div className="footer-column">
              <h4>使用说明</h4>
              <span>支持图片与视频检测</span>
              <span>结果仅供辅助判断</span>
              <span>演示模式明确标识</span>
              <span>检测记录按会话隔离</span>
            </div>
            <div className="footer-column">
              <h4>技术支持</h4>
              <p>网站前后端可独立部署，检测模型通过服务端加载，接入新模型无需改动页面交互。</p>
              <a className="footer-link" href="#workspace"><Icon name="scan" />前往智能检测台<Icon name="arrow-up-right" /></a>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {SITE.name}。本页面为车辆受损检测辅助工具。</span>
            <div>
              <span>检测结果不替代专业定损结论</span>
              <a href="https://unsplash.com" target="_blank" rel="noreferrer">示例图片来源<Icon name="arrow-up-right" /></a>
            </div>
          </div>
        </div>
      </footer>

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
