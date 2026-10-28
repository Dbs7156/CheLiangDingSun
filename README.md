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
│  ├─ best.onnx               # 当前使用的 YOLO26n 模型（约 9.5 MB）
│  ├─ requirements.txt
│  └─ .env.example
├─ deploy/
│  ├─ deploy.sh               # 服务器拉取、构建、重启脚本
│  ├─ nginx.conf.example      # Nginx 站点模板
│  └─ vehicle-damage.service.example
├─ .env.example               # 本地 API 地址示例
├─ .env.production            # 服务器同源构建默认值
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

## GitHub 与服务器部署

### 1. 推送到 GitHub

项目已经包含可部署的模型文件和构建配置。首次推送：

```bash
git add -A
git commit -m "chore: prepare GitHub deployment"
git push -u origin main
```

后续更新只需要：

```bash
git add -A
git commit -m "feat: update site"
git push origin main
```

以下内容已被 `.gitignore` 忽略，不会推到 GitHub：

- `node_modules/`、`.next/`、`out/`
- `backend/.venv/`
- `.env`、`.env.local`
- `backend/history.db`
- 运行日志和临时上传文件

`backend/best.onnx` 是例外，已纳入 Git。它约 9.5 MB，低于 GitHub 单文件 100 MB 限制，因此服务器直接 `git clone` 就能拿到模型。如果以后模型超过 100 MB，应改用 Git LFS 或单独的对象存储。

### 2. 服务器首次部署

下面以 Ubuntu/Debian、项目目录 `/opt/vehicle-damage` 为例。服务器需要：

- Git
- Nginx
- Python 3.11+
- Node.js 20+
- 一个可以运行后端进程的普通 Linux 用户

安装基础依赖（Node.js 请安装 20 LTS 或更高版本）：

```bash
sudo apt update
sudo apt install -y git nginx python3-venv curl
node --version
python3 --version
```

如果服务器还没有 GitHub SSH 权限，先配置 Deploy Key，或改用仓库的 HTTPS 地址克隆。

```bash
sudo mkdir -p /opt/vehicle-damage
sudo chown "$USER":"$USER" /opt/vehicle-damage

git clone git@github.com:Dbs7156/CheLiangDingSun.git /opt/vehicle-damage
cd /opt/vehicle-damage
```

检查模型是否随仓库拉取成功：

```bash
ls -lh backend/best.onnx
```

#### 首次配置后端环境

```bash
cd /opt/vehicle-damage/backend
cp .env.example .env
```

HTTP 首次部署可以保持：

```dotenv
COOKIE_SECURE=false
```

配置 HTTPS 后改为 `true`。使用下面的 Nginx 同源部署时，不需要额外配置 CORS。

#### 安装 Nginx 配置

仓库提供了模板 `deploy/nginx.conf.example`。先用 IP 访问时，把服务器名占位符替换为 `_`：

```bash
cd /opt/vehicle-damage

sed \
  -e 's|__PROJECT_ROOT__|/opt/vehicle-damage|g' \
  -e 's|__SERVER_NAME__|_|g' \
  deploy/nginx.conf.example \
  | sudo tee /etc/nginx/sites-available/vehicle-damage >/dev/null

sudo ln -sf /etc/nginx/sites-available/vehicle-damage /etc/nginx/sites-enabled/vehicle-damage

# 仅在没有其他网站的情况下移除默认站点，避免 IP 访问命中 Nginx 默认页
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
```

有域名时，把 `__SERVER_NAME__` 替换成实际域名，并提前配置 DNS 解析。

#### 安装 systemd 服务

```bash
cd /opt/vehicle-damage

sed \
  -e "s|__PROJECT_ROOT__|/opt/vehicle-damage|g" \
  -e "s|__USER__|$USER|g" \
  deploy/vehicle-damage.service.example \
  | sudo tee /etc/systemd/system/vehicle-damage.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable vehicle-damage
```

> 必须保持 **1 个 Uvicorn worker**。视频任务状态保存在进程内，多 worker 会导致轮询请求落到另一个进程，报“任务不存在”。

#### 执行首次部署

```bash
cd /opt/vehicle-damage
bash deploy/deploy.sh
```

这个脚本会依次完成：

1. 创建 `backend/.venv` 并安装 Python 依赖
2. `npm ci` 安装前端依赖
3. 以同源 API `/` 构建 `out/`
4. 重启 `vehicle-damage` systemd 服务
5. 重载 Nginx
6. 请求 `/api/health` 验证后端

完成后访问：

```text
http://服务器IP/
```

前端和 `/api` 都由 Nginx 统一对外提供服务，因此不存在跨域 Cookie 问题。

### 3. 后续更新

本地推送新提交：

```bash
git add -A
git commit -m "feat: update site"
git push origin main
```

登录服务器执行：

```bash
cd /opt/vehicle-damage
git pull --ff-only
bash deploy/deploy.sh
```

脚本会安装依赖、重新构建并重启服务。`.env`、SQLite 记录和 `.venv` 不会被 Git 覆盖。

### 4. 配置 HTTPS

先把 Nginx 配置中的 `server_name _` 或 IP 改成域名，然后：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

修改 `backend/.env`：

```dotenv
COOKIE_SECURE=true
```

重启后端：

```bash
sudo systemctl restart vehicle-damage
```

### 5. 常见问题

| 现象 | 排查 |
| --- | --- |
| 打开 IP 是 Nginx 默认页 | 是否删除了 `/etc/nginx/sites-enabled/default`，是否执行了 `nginx -t` 和 reload |
| 页面显示“服务未连接” | 检查 Nginx 是否把 `/api/` 反代到 `127.0.0.1:8000` |
| 视频上传返回 413 | Nginx `client_max_body_size` 是否已设置为 `220m` |
| 模型状态不是 `model` | `backend/best.onnx` 是否存在，`DETECTION_MODE` 是否为 `auto` |
| 视频轮询报“任务不存在” | 是否误开了多个 Uvicorn worker，当前只能使用 1 个 |
| 后端重启失败 | `sudo systemctl status vehicle-damage`、`sudo journalctl -u vehicle-damage -n 100` |

部署脚本、Nginx 模板和 systemd 模板都在 [deploy/](deploy/) 目录中。

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
- ONNX 模型文件已纳入 Git（约 9.5 MB，低于 GitHub 单文件 100 MB 限制），服务器克隆后即可直接加载；若以后替换成更大的模型，建议改用 Git LFS 或对象存储。

## 说明

- 前端、后端可分别运行；生产环境通过反向代理组合。
- 视频任务使用进程内线程池，请以单 Uvicorn worker 运行，或后续替换为独立任务队列。
- 示例车辆图片来自 [Unsplash](https://unsplash.com)，仅用于演示。
- 检测结果仅供辅助判断，不替代专业定损、维修或保险理赔结论。
