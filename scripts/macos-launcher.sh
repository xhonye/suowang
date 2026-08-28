#!/bin/bash
# Launches the bundled SUOWANG service from inside SUOWANG.app.
set -euo pipefail

launcher_dir="$(cd "$(dirname "$0")" && pwd)"
app_root="$(cd "$launcher_dir/../Resources/app" && pwd)"
node_path="$app_root/runtime/bin/node"

show_error() {
  local message="$1"
  osascript - "$message" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display alert "所往启动失败" message (item 1 of argv) as critical
end run
APPLESCRIPT
}

if [[ ! -x "$node_path" ]]; then
  show_error "阶段：读取启动配置
原因：内置运行环境缺失。
日志：尚未建立日志文件
下一步：请重新下载并安装所往。"
  exit 1
fi

config_json="$(cd "$app_root" && "$node_path" scripts/launcher-config.mjs)"
read_json_value() {
  "$node_path" -e "const value = JSON.parse(process.argv[1])[process.argv[2]]; process.stdout.write(value == null ? '' : String(value));" "$1" "$2"
}
expected_version="$(read_json_value "$config_json" expectedVersion)"
access_mode="$(read_json_value "$config_json" accessMode)"
data_dir="$(read_json_value "$config_json" dataDir)"
port="$(read_json_value "$config_json" port)"
health_url="$(read_json_value "$config_json" localHealthUrl)"
app_url="$(read_json_value "$config_json" localAppUrl)"
logs_dir="$data_dir/logs"
stderr_log="$logs_dir/latest-stderr.log"

get_health() {
  curl --silent --fail --max-time 2 "$health_url" 2>/dev/null || true
}

get_listener_pid() {
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
}

listener_mode_matches() {
  local pid="$1"
  [[ -n "$pid" ]] || { printf 'false'; return; }
  local names local_count total_count
  names="$(lsof -nP -a -p "$pid" -iTCP:"$port" -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n//p')"
  local_count="$(printf '%s\n' "$names" | grep -Ec "^127\.0\.0\.1:$port$" || true)"
  total_count="$(printf '%s\n' "$names" | grep -Ec ":$port$" || true)"
  if [[ "$access_mode" == "tailscale" ]]; then
    [[ "$local_count" -eq 1 && "$total_count" -ge 2 ]] && printf 'true' || printf 'false'
  else
    [[ "$local_count" -eq 1 && "$total_count" -eq 1 ]] && printf 'true' || printf 'false'
  fi
}

verify_suowang_pid() {
  local pid="$1"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || { printf 'false'; return; }
  local command
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == *"scripts/serve.mjs"* ]] && printf 'true' || printf 'false'
}

make_policy_input() {
  "$node_path" -e '
    const [version, mode, healthJson, occupied, modeMatches, verified] = process.argv.slice(1);
    const health = healthJson ? JSON.parse(healthJson) : null;
    process.stdout.write(JSON.stringify({
      expectedVersion: version,
      expectedAccessMode: mode,
      health,
      listener: { occupied: occupied === "true", accessModeMatches: modeMatches === "true" },
      processVerified: verified === "true",
    }));
  ' "$expected_version" "$access_mode" "$1" "$2" "$3" "$4"
}

decide() {
  local input
  input="$(make_policy_input "$1" "$2" "$3" "$4")"
  (cd "$app_root" && "$node_path" src/server/launcher-policy.mjs "$input")
}

stop_verified_process() {
  local pid="$1"
  if [[ "$(verify_suowang_pid "$pid")" != "true" ]]; then
    show_error "阶段：安全切换旧服务
原因：后台进程无法确认为 SUOWANG，已拒绝终止以保护其他程序。
日志：$stderr_log
下一步：请退出占用端口的程序，或重启电脑后再试。"
    exit 1
  fi
  kill -TERM "$pid"
  for _ in {1..40}; do
    sleep 0.1
    kill -0 "$pid" 2>/dev/null || return
  done
  if [[ "$(verify_suowang_pid "$pid")" != "true" ]]; then
    show_error "阶段：安全切换旧服务
原因：旧进程未正常退出，且身份已无法再次确认。
日志：$stderr_log
下一步：请重启电脑后再试。"
    exit 1
  fi
  kill -KILL "$pid"
  for _ in {1..30}; do
    sleep 0.1
    [[ -z "$(get_listener_pid)" ]] && return
  done
  show_error "阶段：安全切换旧服务
原因：端口没有及时释放。
日志：$stderr_log
下一步：请稍后重试。"
  exit 1
}

mkdir -p "$logs_dir"
health_json="$(get_health)"
listener_pid="$(get_listener_pid)"
occupied="$([[ -n "$listener_pid" ]] && printf 'true' || printf 'false')"
mode_matches="$(listener_mode_matches "$listener_pid")"
health_pid="$(read_json_value "${health_json:-{}}" pid 2>/dev/null || true)"
candidate_pid="${health_pid:-$listener_pid}"
process_verified='false'
if [[ -n "$listener_pid" && "$candidate_pid" == "$listener_pid" ]]; then
  process_verified="$(verify_suowang_pid "$candidate_pid")"
fi
decision_json="$(decide "$health_json" "$occupied" "$mode_matches" "$process_verified")"
action="$(read_json_value "$decision_json" action)"
reason="$(read_json_value "$decision_json" reason)"
stop_existing="$(read_json_value "$decision_json" stopExisting)"

if [[ "$action" == 'conflict' ]]; then
  show_error "阶段：检查现有服务
原因：端口 $port 的服务不满足安全复用条件（$reason），SUOWANG 不会终止未验证进程。
日志：$stderr_log
下一步：请退出占用端口的程序，或把日志发给维护者。"
  exit 1
fi
if [[ "$action" == 'restart' && "$stop_existing" == 'true' ]]; then
  stop_verified_process "$candidate_pid"
fi

if [[ "$action" != 'reuse' ]]; then
  (
    cd "$app_root"
    nohup "$node_path" scripts/serve.mjs \
      >>"$logs_dir/latest-stdout.log" \
      2>>"$stderr_log" < /dev/null &
  )

  ready='false'
  for _ in {1..40}; do
    sleep 0.25
    health_json="$(get_health)"
    listener_pid="$(get_listener_pid)"
    occupied="$([[ -n "$listener_pid" ]] && printf 'true' || printf 'false')"
    mode_matches="$(listener_mode_matches "$listener_pid")"
    decision_json="$(decide "$health_json" "$occupied" "$mode_matches" 'false')"
    if [[ "$(read_json_value "$decision_json" action)" == 'reuse' ]]; then
      ready='true'
      break
    fi
  done
  if [[ "$ready" != 'true' ]]; then
    show_error "阶段：启动本地服务
原因：新服务没有通过完整 health 校验。
日志：$stderr_log
下一步：请查看日志，或把日志发给维护者。"
    exit 1
  fi
fi

if [[ "${SUOWANG_SKIP_BROWSER:-}" != '1' ]]; then
  open "$app_url"
fi
