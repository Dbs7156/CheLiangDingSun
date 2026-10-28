# 车损智检

车辆受损图片 / 视频目标检测网站。用户上传车辆图片或视频后，由服务端模型识别损伤类别与位置，在原始画面上显示检测框，并保存到 30 天会话记录中。

项目结构沿用 [Dbs7156/zero-to-tech](https://github.com/Dbs7156/zero-to-tech) 的组织方式：前端在根目录使用 `app / components / css / data`，后端在 `backend` 中保持扁平文件结构。前端为 **JSX + 原生 CSS**，不使用 TypeScript、Tailwind 或额外的 UI 框架。

> **当前状态：正式 ONNX 模型已接入。**
> `backend/best.onnx` 是训练好的 YOLO26n 车辆受损端到端模型。后端启动后会进入 `model` 模式，页面状态显示“模型已就绪”。只有模型文件缺失时才会自动切换到演示模式。

## 功能

- 图片检测：JPG、PNG、WebP，最大 15 MB。
- 视频检测：MP4、WebM、MOV，最大 200 MB、3 分钟。
- 视频异步任务：上传后轮询处理进度，在播放器中按时间轴叠加检测框。
- 可调置信度阈值与重叠抑制阈值，设置保存在浏览器本地。
- 结果摘要、类别分布、检测明细，以及图片检测框与明细行的联动定位。
- 导出检测报告，以及带检测框的图片。
- SQLite 会话记录：缩略图、摘要、30 天保留，可清空。
- 演示模式与正式 ONNX 模式自动切换。
- 桌面 / 平板 / 手机响应式布局。

## 目录结构

```text
.
├─ app/
│  ├─ layout.jsx              # 全站 metadata、图标 sprite、CSS 引入
│  └─ page.jsx                # 只负责渲染 HomeView
├─ components/
│  ├─ AnimatedCardGrid.jsx    # 页面区块的 CSS 入场包装
│  ├─ HistoryModal.jsx        # 原生 dialog 检测记录弹窗
│  ├─ HomeView.jsx            # 首页组合与页面级状态
│  ├─ InputCard.jsx           # 上传、预览、参数、图片/视频识别
│  ├─ Nav.jsx                 # 顶部导航与移动端菜单
│  ├─ PageHeading.jsx         # 区块标题
│  └─ ResultCard.jsx          # 结果摘要、明细、导出
├─ css/
│  ├─ reset.css               # 浏览器基础重置
│  ├─ variables.css           # 颜色、圆角、阴影、字体变量
│  ├─ layout.css              # 全局排版、按钮、标签、页脚
│  ├─ nav.css                 # 顶部导航与移动端菜单
│  ├─ hero.css                # 首屏区域与检测预览
│  ├─ cards.css               # 能力、流程、隐私区块
│  ├─ lab.css                 # 检测工作台、结果与历史弹窗
│  └─ responsive.css          # 所有媒体查询
├─ data/
│  └─ site.js                 # 页面文案、导航、上传限制、模拟数据
├─ public/
│  ├─ favicon.svg
│  └─ images/sample-vehicle.jpg
├─ backend/
│  ├─ main.py                 # FastAPI 路由、上传、任务、会话 Cookie
│  ├─ storage.py              # SQLite 检测记录
│  ├─ inference.py            # 图片/视频解码、ONNX、演示数据、跟踪
│  ├─ classes.json            # 模型类别顺序与中文名（已与模型匹配）
│  ├─ best.onnx               # ★ 当前使用的 YOLO26n 模型
│  ├─ requirements.txt
│  └─ .env.example
├─ .env.example               # NEXT_PUBLIC_API_BASE_URL
├─ .gitignore
├─ next.config.mjs
├─ package.json
├─ package-lock.json
├─ requirements.txt           # 引用 backend/requirements.txt
└─ README.md
```

`node_modules/`、`.next/`、`out/`、`backend/.venv/`、`backend/history.db` 和 `backend/*.onnx` 是生成或本地文件，不提交到仓库。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15、React 19、JSX、原生 CSS |
| 后端 | FastAPI、Uvicorn |
| 推理 | ONNX Runtime、NumPy、Pillow、OpenCV |
| 存储 | SQLite + HttpOnly Cookie 会话 |
| 开发辅助 | Node.js、Python venv |

前端基础交互全部使用浏览器原生能力：

- 检测记录弹窗使用原生 `<dialog>`，自带焦点管理。
- 阈值使用 `<input type="range">`。
- 视频使用原生 `<video>`，检测框通过 Canvas 叠加。
- 下载使用 `Blob` + `<a download>`。
- 请求使用原生 `fetch`，进度使用 React state 轮询。
- 图标使用 `layout.jsx` 中的 SVG sprite，不额外安装图标库。

## 快速开始

要求：Node.js 20+、npm、Python 3.11+。

### 1. 后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

macOS / Linux：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

- API 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/health
- 当前模型状态：http://localhost:8000/api/model

首次启动会自动创建 `backend/history.db`。后端会自动加载 `backend/best.onnx`；只有该文件缺失时才会进入演示模式。

### 2. 前端

另开一个终端：

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 **http://localhost:3000**。

> 本地请保持前端和 API 都使用 `localhost`，或都使用 `127.0.0.1`。浏览器不把 `localhost` 和 `127.0.0.1` 视为同一站点，混用可能导致会话记录 Cookie 失效。

### 3. 生产静态导出

```powershell
npm run build
npm run start
```

`npm run build` 会生成根目录的 `out/`，`npm run start` 使用 `serve` 托管静态文件。后端继续用 Uvicorn 启动。生产环境建议用 Nginx 将前端静态文件和 `/api` 放在同一域名下，以稳定保存会话 Cookie。

## ONNX 模型

### 当前模型

当前后端使用你放入的 `backend/best.onnx`：

| 项目 | 值 |
| --- | --- |
| 模型来源 | Ultralytics YOLO26n |
| 训练数据 | CarDD |
| 输入 | `1 × 3 × 640 × 640` |
| 输出 | `1 × 300 × 6` 端到端检测结果 |
| 推理引擎 | ONNX Runtime，默认 CPU |
| 当前类别 | dent、scratch、crack、glass shatter、lamp broken、tire flat |

后端启动时会读取模型内置元数据，并校验模型类别数与 `classes.json` 是否一致；不一致时会停止加载，避免标签错位。

### 训练数据来源

模型使用 **CarDD（Car Damage Detection Dataset）** 训练。CarDD 由中国科学院与中国科学技术大学的研究团队构建，包含 4,000 张高分辨率车损图像、9,000+ 个标注实例和 6 类车损标签。

- 数据集主页：<https://cardd-ustc.github.io/>
- 论文 PDF：<https://cardd-ustc.github.io/docs/CarDD.pdf>
- 引用：Wang, X., Li, W., & Wu, Z. *CarDD: A New Dataset for Vision-Based Car Damage Detection*. IEEE T-ITS, 2023. DOI: 10.1109/TITS.2023.3258480

数据集的下载和使用需遵循 CarDD 官方许可说明。网站上传的检测图片 / 视频不会被写入训练集，也不会用于模型再训练。

当前 `classes.json` 已与模型类别顺序匹配：

| ID | 模型类别 | 页面显示 |
| --- | --- | --- |
| 0 | dent | 凹陷 |
| 1 | scratch | 划痕 |
| 2 | crack | 裂纹 |
| 3 | glass shatter | 玻璃破损 |
| 4 | lamp broken | 车灯破损 |
| 5 | tire flat | 轮胎破损 |

### 替换模型

如果以后重新训练并导出模型：

1. 用新的 ONNX 文件替换 `backend/best.onnx`。
2. 按新模型输出顺序修改 [backend/classes.json](backend/classes.json)。
3. 重启后端。
4. 检查 `GET /api/model` 是否返回 `"mode": "model"`、`"ready": true`。
5. 用真实图片和视频验证类别、检测框和置信度。

**不要创建空的 `.onnx` 文件。** 模型文件不存在时 `auto` 模式会保持演示模式；文件存在但加载失败时会显示“模型异常”，避免把演示结果当成真实结果。

### 类别配置

```json
{
  "classes": [
    { "id": 0, "key": "dent", "name": "凹陷", "color": "#2563eb" },
    { "id": 1, "key": "scratch", "name": "划痕", "color": "#0d9488" }
  ]
}
```

- 数组顺序必须与模型输出通道顺序一致。
- `key` 为内部唯一标识。
- `name` 为界面中文名称。
- `color` 为检测框颜色。

### 模型兼容参数

可在 `backend/.env` 或环境变量中调整：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DETECTION_MODE` | `auto` | `auto` / `demo` / `model` |
| `MODEL_PATH` | `best.onnx` | 模型文件路径 |
| `CLASSES_PATH` | `classes.json` | 类别配置路径 |
| `ONNX_PROVIDERS` | `CUDAExecutionProvider,CPUExecutionProvider` | 优先使用可用 GPU，否则回退 CPU |
| `MODEL_INPUT_SIZE` | `640` | 模型无法推断输入尺寸时的回退值 |
| `MODEL_OUTPUT_FORMAT` | `auto` | `auto` / `yolov8` / `yolov5` / `end2end` |
| `MODEL_BOX_FORMAT` | `auto` | `auto` / `cxcywh` / `xyxy` |
| `MODEL_INPUT_COLOR` | `rgb` | `rgb` / `bgr` |
| `VIDEO_SAMPLE_FPS` | `3` | 视频每秒采样分析帧数 |
| `MAX_VIDEO_SECONDS` | `180` | 视频时长上限 |

兼容常见的 YOLO 原始输出 `[1, 4+nc, N]`、YOLOv5 输出 `[1, 5+nc, N]` 和包含 NMS 的端到端输出 `[1, N, 6]`，并自动执行 letterbox 还原与 NMS。当前模型属于最后一种格式。

## API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/model` | 模型 / 演示模式状态、类别列表 |
| POST | `/api/detections/image` | 图片检测 |
| POST | `/api/detections/video` | 创建视频异步任务 |
| GET | `/api/jobs/{job_id}` | 查询视频任务 |
| GET | `/api/history` | 当前会话检测记录 |
| GET | `/api/history/{id}/thumbnail` | 记录缩略图 |
| DELETE | `/api/history` | 清空当前会话记录 |

图片和视频接口的 multipart 字段为 `file`、`confidence`、`iou`。

## 数据与隐私

- 检测记录与当前浏览器的 HttpOnly 会话 Cookie 绑定，默认保留 **30 天**。
- 数据库仅保存缩略图、检测摘要和参数，不长期保存原始图片 / 视频。
- 网站上传的图片和视频不用于训练模型。
- 视频上传后写入独立临时目录，任务完成会立即删除。
- 单会话最多保留 100 条记录。
- 用户可以随时在“检测记录”中清空当前会话的数据。
- 部署在 HTTPS 环境时，将 `COOKIE_SECURE` 设为 `true`。

## 当前模型验证情况

- 图片接口已用 `best.onnx` 实测，返回真实模型推理结果。
- 视频异步任务已用 `best.onnx` 实测，可生成真实检测时间轴与轨迹。
- 端到端输出已正确解析，检测框可还原到原图坐标。
- 当前示例车辆图片上模型也会给出轮胎相关检测，属于模型预测结果；阈值越高结果越少。模型精度最终取决于训练数据和训练质量。
- ONNX 模型文件不提交 Git，部署时需要单独放到 `backend/best.onnx`。

## 说明

- 前端、后端可分别运行；生产环境通过反向代理组合。
- 视频任务使用进程内线程池，请以单 Uvicorn worker 运行，或后续替换为独立任务队列。
- 示例车辆图片来自 [Unsplash](https://unsplash.com)，仅用于演示。
- 检测结果仅供辅助判断，不替代专业定损、维修或保险理赔结论。
