#!/bin/bash
# Launches the bundled SUOWANG service from inside SUOWANG.app.
set -euo pipefail

launcher_dir="$(cd "$(dirname "$0")" && pwd)"
app_root="$(cd "$launcher_dir/../Resources/app" && pwd)"
node_path="$app_root/runtime/bin/node"
port="${SUOWANG_PORT:-2037}"
health_url="http://127.0.0.1:${port}/health"
app_url="http://127.0.0.1:${port}/"

if [[ -n "${SUOWANG_DATA_DIR:-}" ]]; then
  data_dir="$SUOWANG_DATA_DIR"
else
  data_dir="$HOME/Library/Application Support/SUOWANG"
fi
logs_dir="$data_dir/logs"

show_error() {
  local message="$1"
  osascript - "$message" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display alert "所往启动失败" message (item 1 of argv) as critical
end run
APPLESCRIPT
}

is_healthy() {
  curl --silent --show-error --fail --max-time 2 "$health_url" 2>/dev/null \
    | grep -q '"status":"ok"'
}

if [[ ! -x "$node_path" ]]; then
  show_error "内置运行环境缺失。请重新下载并安装所往。"
  exit 1
fi

mkdir -p "$logs_dir"

if ! is_healthy; then
  (
    cd "$app_root"
    nohup "$node_path" scripts/serve.mjs \
      >>"$logs_dir/latest-stdout.log" \
      2>>"$logs_dir/latest-stderr.log" < /dev/null &
  )

  for _ in {1..30}; do
    sleep 0.25
    if is_healthy; then break; fi
  done
fi

if ! is_healthy; then
  show_error "本地服务没有启动。日志：$logs_dir/latest-stderr.log"
  exit 1
fi

open "$app_url"
