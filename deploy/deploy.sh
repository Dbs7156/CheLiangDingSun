#!/usr/bin/env bash
#
# Build and deploy the current checkout on a Linux server.
#
# Pull first:
#   cd /opt/vehicle-damage
#   git pull --ff-only
#   bash deploy/deploy.sh
#
# One-time server setup is documented in README.md, including:
#   - /etc/systemd/system/vehicle-damage.service
#   - /etc/nginx/sites-available/vehicle-damage
#
# The script assumes the Nginx site serves this project's out/ directory and
# proxies /api/ to 127.0.0.1:8000. It must be run by a user allowed to sudo
# systemctl/nginx, or as root.

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="${SERVICE_NAME:-vehicle-damage}"
NGINX_SERVICE="${NGINX_SERVICE:-nginx}"
cd "$ROOT_DIR"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$*"
}

fail() {
  printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2
  exit 1
}

for command in python3 node npm curl; do
  command -v "$command" >/dev/null 2>&1 || fail "缺少命令：$command"
done

[ -s backend/best.onnx ] || fail "缺少模型文件 backend/best.onnx，请确认 Git 拉取完整。"

log "准备 Python 环境"
if [ ! -x backend/.venv/bin/python ]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt

log "安装前端依赖并构建静态文件"
npm ci --no-audit --no-fund
# 强制同源 API，避免服务器上的旧 .env.local 把地址写成 localhost。
NEXT_PUBLIC_API_BASE_URL=/ npm run build

log "检查 systemd / Nginx 配置"
$SUDO systemctl cat "${SERVICE_NAME}.service" >/dev/null 2>&1 \
  || fail "未找到 ${SERVICE_NAME}.service，请先按 README 完成首次 systemd 配置。"
$SUDO nginx -t

log "重启后端"
$SUDO systemctl restart "$SERVICE_NAME"

log "重载 Nginx"
$SUDO systemctl reload "$NGINX_SERVICE"

log "等待后端健康检查"
health_ok=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

if [ "$health_ok" -ne 1 ]; then
  $SUDO systemctl status "$SERVICE_NAME" --no-pager || true
  fail "后端健康检查失败，请查看：journalctl -u ${SERVICE_NAME} -n 100"
fi

printf '\n\033[1;32m部署完成。\033[0m\n'
printf '前端：http://<服务器域名或IP>/\n'
printf '后端：http://127.0.0.1:8000/api/health\n'
printf '服务状态：systemctl status %s\n' "$SERVICE_NAME"
