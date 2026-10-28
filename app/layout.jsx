import "../css/reset.css";
import "../css/variables.css";
import "../css/layout.css";
import "../css/nav.css";
import "../css/hero.css";
import "../css/cards.css";
import "../css/lab.css";
import "../css/responsive.css";

export const metadata = {
  title: "车损智检｜车辆受损智能识别",
  description:
    "上传车辆图片或视频，快速定位凹陷、划痕、裂纹、玻璃破损等损伤。图片与视频双模式检测，结果清晰可追溯。",
  keywords: ["车辆受损检测", "车损识别", "智能定损", "目标检测", "车损智检"],
  applicationName: "车损智检",
  authors: [{ name: "车损智检" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "车损智检｜车辆受损智能识别",
    description:
      "上传车辆图片或视频，快速定位车损位置与类别，让检测更高效、结果更清晰。",
    type: "website",
    locale: "zh_CN",
    siteName: "车损智检",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#f7f9fc",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

const iconPaths = {
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.708L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  "arrow-up-right": (
    <>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </>
  ),
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  film: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 4v16" />
      <path d="M17 4v16" />
      <path d="M2 9h5" />
      <path d="M2 15h5" />
      <path d="M17 9h5" />
      <path d="M17 15h5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 0 0-15-6.708L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15 6.708L21 16" />
      <path d="M21 21v-5h-5" />
    </>
  ),
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  eye: (
    <>
      <path d="M2.1 12a10.9 10.9 0 0 1 19.8 0 10.9 10.9 0 0 1-19.8 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="m2 2 20 20" />
      <path d="M6.7 6.8C3.9 8.5 2.1 12 2.1 12a10.9 10.9 0 0 0 15.2 5.2" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M21.9 12c-.7-1.4-3.2-6.2-9.9-6.2-.7 0-1.4.1-2 .2" />
    </>
  ),
  alert: (
    <>
      <path d="m10.3 3.7-8 14A2 2 0 0 0 4 20.7h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  gauge: (
    <>
      <path d="m12 14 4-4" />
      <path d="M3.3 19a10 10 0 1 1 17.4 0" />
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z" />
      <path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z" />
      <path d="m19 13-1 2.7-2.7 1 2.7 1 1 2.7 1-2.7 2.7-1-2.7-1L19 13Z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5" />
      <path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />
      <path d="M7 16h10" />
    </>
  ),
  "cloud-off": (
    <>
      <path d="m2 2 20 20" />
      <path d="M5.8 5.8A7 7 0 0 0 9 19h8a4 4 0 0 0 2.8-1.2" />
      <path d="M18.5 15.5A4.5 4.5 0 0 0 17 7h-1.3A7 7 0 0 0 8 4.6" />
    </>
  ),
};

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true" focusable="false">
      {Object.entries(iconPaths).map(([name, paths]) => (
        <symbol
          key={name}
          id={`i-${name}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {paths}
        </symbol>
      ))}
    </svg>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
