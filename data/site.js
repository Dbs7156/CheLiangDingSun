export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

export const SITE = {
  name: "车损智检",
  tagline: "车辆受损智能识别",
  description:
    "上传车辆图片或视频，自动定位损伤位置与类别，让检测更高效、结果更清晰。",
  retentionDays: 30,
  sampleImage: "/images/sample-vehicle.jpg",
};

export const FILE_LIMITS = {
  imageBytes: 15 * 1024 * 1024,
  videoBytes: 200 * 1024 * 1024,
  videoDurationSeconds: 180,
  imageLabel: "15 MB",
  videoLabel: "200 MB",
  videoDurationLabel: "3 分钟",
};

export const NAV_ITEMS = [
  { href: "#workspace", label: "智能检测", number: "01" },
  { href: "#capabilities", label: "检测能力", number: "02" },
  { href: "#workflow", label: "使用流程", number: "03" },
  { href: "#dataset", label: "数据来源", number: "04" },
];

export const FALLBACK_CLASSES = [
  { id: 0, key: "dent", name: "凹陷", color: "#2563eb" },
  { id: 1, key: "scratch", name: "划痕", color: "#0d9488" },
  { id: 2, key: "crack", name: "裂纹", color: "#ea580c" },
  { id: 3, key: "glass_shatter", name: "玻璃破损", color: "#7c3aed" },
  { id: 4, key: "lamp_broken", name: "车灯破损", color: "#d97706" },
  { id: 5, key: "tire_flat", name: "轮胎破损", color: "#e11d48" },
];

export const HERO_DETECTIONS = [
  {
    id: "hero-scratch",
    name: "划痕",
    confidence: 91,
    color: "#0d9488",
    style: { left: "31.5%", top: "53%", width: "15%", height: "8%" },
    labelAbove: true,
  },
  {
    id: "hero-dent",
    name: "凹陷",
    confidence: 86,
    color: "#2563eb",
    style: { left: "59.5%", top: "47.5%", width: "12%", height: "12.5%" },
    labelAbove: true,
  },
  {
    id: "hero-tire",
    name: "轮胎破损",
    confidence: 78,
    color: "#e11d48",
    style: { left: "22.4%", top: "68.5%", width: "8.5%", height: "12.5%" },
    labelAbove: false,
  },
];

export const TRUST_ITEMS = [
  { icon: "image", title: "图片检测", detail: "单张定位损伤" },
  { icon: "film", title: "视频检测", detail: "时间轴动态标注" },
  { icon: "lock", title: "会话隔离", detail: "记录保留 30 天" },
];

export const SCENARIOS = [
  { icon: "shield", title: "保险理赔初筛" },
  { icon: "check", title: "二手车评估" },
  { icon: "target", title: "维修接车检查" },
  { icon: "layers", title: "车队日常巡检" },
];

export const CAPABILITIES = [
  {
    id: "01",
    icon: "scan",
    title: "损伤定位与分类",
    description:
      "在画面中直接标出损伤位置、类别与置信度，多个目标同时呈现，结果一眼可读。",
    visual: "classes",
  },
  {
    id: "02",
    icon: "film",
    title: "视频动态标注",
    description:
      "按关键帧分析视频画面，检测框随时间同步呈现，可暂停、回看并定位到具体片段。",
    visual: "timeline",
  },
  {
    id: "03",
    icon: "history",
    title: "记录自动归档",
    description:
      "每次检测自动留下缩略图与摘要，按会话隔离保存，便于短周期内回看与复核。",
    visual: "records",
  },
];

export const WORKFLOW_STEPS = [
  {
    number: "01",
    icon: "upload",
    title: "上传图片或视频",
    description:
      "拖放文件到检测画布，或从本地选择。支持 JPG、PNG、WebP 图片与 MP4、WebM、MOV 视频。",
    meta: "单图 15 MB 以内",
  },
  {
    number: "02",
    icon: "target",
    title: "调整阈值并识别",
    description:
      "按需调节置信度与重叠抑制阈值，点击开始识别。图片即时返回，视频显示实时处理进度。",
    meta: "参数支持记忆",
  },
  {
    number: "03",
    icon: "check",
    title: "核对结果并导出",
    description:
      "在原始画面上查看检测框与置信度，导出数据报告或带框标注图，结果自动进入检测记录。",
    meta: "记录保留 30 天",
  },
];

export const DATASET_SOURCE = {
  name: "CarDD",
  fullName: "Car Damage Detection Dataset",
  url: "https://cardd-ustc.github.io/",
  paperUrl: "https://cardd-ustc.github.io/docs/CarDD.pdf",
  institution: "中国科学院、中国科学技术大学",
  citation:
    "Wang, X., Li, W., & Wu, Z. · IEEE T-ITS 2023 · DOI 10.1109/TITS.2023.3258480",
};

export const DATASET_FACTS = [
  { icon: "image", value: "4,000", label: "张高分辨率车损图像" },
  { icon: "target", value: "9,000+", label: "个精细标注实例" },
  { icon: "layers", value: "6 类", label: "车损标签" },
];

export const SAMPLE_CLASS_COUNTS = [
  { id: 0, name: "凹陷", color: "#2563eb", count: 4, width: 78 },
  { id: 1, name: "划痕", color: "#0d9488", count: 3, width: 58 },
  { id: 2, name: "裂纹", color: "#ea580c", count: 2, width: 41 },
  { id: 3, name: "玻璃破损", color: "#7c3aed", count: 1, width: 23 },
];
