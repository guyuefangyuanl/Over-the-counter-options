#!/usr/bin/env bash

set -u

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT" || exit 1

LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/logs}"
STARTUP_LOG="${STARTUP_LOG:-$LOG_DIR/startup.log}"
PID_DIR="${PID_DIR:-$LOG_DIR/pids}"

START_NODE="${START_NODE:-1}"
START_FLASK="${START_FLASK:-1}"

NODE_PORT="${NODE_PORT:-${NODE_API_PORT:-5002}}"
FLASK_PORT="${FLASK_PORT:-5000}"

GIT_AUTO_PUSH="${GIT_AUTO_PUSH:-1}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_PUSH_REF="${GIT_PUSH_REF:-HEAD}"
GIT_COMMIT_PREFIX="${GIT_COMMIT_PREFIX:-自动提交： }"

MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-3}"

mkdir -p "$LOG_DIR" "$PID_DIR"

now() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '%s %s\n' "$(now)" "$*" | tee -a "$STARTUP_LOG" >/dev/null; }

notify_best_effort() {
  local message="$1"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "startup" "$message" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${message//\"/\\\"}\" with title \"startup\"" >/dev/null 2>&1 || true
    return 0
  fi
  return 0
}

retry() {
  local attempts="$1"
  local delay="$2"
  shift 2
  local i=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [ "$i" -ge "$attempts" ]; then
      return 1
    fi
    log "重试(${i}/${attempts})失败，${delay}s 后重试：$*"
    sleep "$delay"
    i=$((i + 1))
  done
}

http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 "$url" >/dev/null 2>&1
    return $?
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$url" <<'PY'
import sys
import urllib.request

url = sys.argv[1]
try:
    with urllib.request.urlopen(url, timeout=2) as r:
        sys.exit(0 if 200 <= r.status < 500 else 1)
except Exception:
    sys.exit(1)
PY
    return $?
  fi
  return 1
}

is_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

has_git_changes() {
  git status --porcelain >/dev/null 2>&1 || return 1
  [ -n "$(git status --porcelain)" ]
}

check_network() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 https://gitee.com >/dev/null 2>&1
    return $?
  fi
  if command -v ping >/dev/null 2>&1; then
    ping -c 1 -W 2 gitee.com >/dev/null 2>&1
    return $?
  fi
  return 0
}

start_node() {
  local health_url="http://127.0.0.1:${NODE_PORT}/api/v1/health"
  if http_ok "$health_url"; then
    log "Node 后端已运行：$health_url"
    return 0
  fi

if ! command -v node >/dev/null 2>&1; then
    log "未找到 node，跳过 Node 启动"
    return 1
  fi

  local node_log="$LOG_DIR/node.log"
  log "启动 Node 后端：PORT=${NODE_PORT} node app.js"
  (export PORT="$NODE_PORT"; nohup node "$PROJECT_ROOT/app.js" >>"$node_log" 2>&1 & echo $! >"$PID_DIR/node.pid") || return 1

  retry "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" http_ok "$health_url"
}

start_flask() {
  local health_url="http://127.0.0.1:${FLASK_PORT}/api/v1/health"
  if http_ok "$health_url"; then
    log "Flask 后端已运行：$health_url"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    log "未找到 python/python3，跳过 Flask 启动"
    return 1
  fi

  local flask_log="$LOG_DIR/flask.log"
  log "启动 Flask 后端：PORT=${FLASK_PORT} ${PYTHON_BIN} app.py"
  (export PORT="$FLASK_PORT"; nohup "$PYTHON_BIN" "$PROJECT_ROOT/app.py" >>"$flask_log" 2>&1 & echo $! >"$PID_DIR/flask.pid") || return 1

  retry "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" http_ok "$health_url"
}

git_auto_push() {
  if [ "$GIT_AUTO_PUSH" != "1" ]; then
    log "GIT_AUTO_PUSH != 1，跳过自动推送"
    return 0
  fi

  if ! is_git_repo; then
    log "当前目录不是 Git 仓库，跳过自动推送"
    return 0
  fi

  if ! git remote get-url "$GIT_REMOTE" >/dev/null 2>&1; then
    log "未找到远程：$GIT_REMOTE，跳过自动推送"
    return 0
  fi

  if ! has_git_changes; then
    log "无代码变更，跳过 commit/push"
    return 0
  fi

  if ! retry "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" check_network; then
    log "网络检测失败，跳过本次 push"
    notify_best_effort "网络不可用，跳过自动推送"
    return 1
  fi

  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local msg="${GIT_COMMIT_PREFIX}${ts}"

  log "执行 git add/commit/push"
  git add -A || return 1
  git commit -m "$msg" >/dev/null 2>&1 || {
    log "git commit 失败（可能无可提交内容），跳过 push"
    return 0
  }

  retry "$MAX_RETRIES" "$RETRY_DELAY_SECONDS" git push "$GIT_REMOTE" "$GIT_PUSH_REF"
}

main() {
  log "========== startup.sh 开始 =========="
  log "工作目录：$PROJECT_ROOT"

  local ok=1
  if [ "$START_NODE" = "1" ]; then
    if start_node; then
      log "Node 启动/检查完成"
    else
      ok=0
      log "Node 启动失败"
      notify_best_effort "Node 启动失败，请查看 logs/node.log"
    fi
  else
    log "START_NODE != 1，跳过 Node"
  fi

  if [ "$START_FLASK" = "1" ]; then
    if start_flask; then
      log "Flask 启动/检查完成"
    else
      ok=0
      log "Flask 启动失败"
      notify_best_effort "Flask 启动失败，请查看 logs/flask.log"
    fi
  else
    log "START_FLASK != 1，跳过 Flask"
  fi

  if git_auto_push; then
    log "Git 自动推送完成/跳过"
  else
    ok=0
    log "Git 自动推送失败"
    notify_best_effort "Git 自动推送失败，请查看 logs/startup.log"
  fi

  log "========== startup.sh 结束 =========="
  if [ "$ok" -eq 1 ]; then
    return 0
  fi
  return 1
}

main "$@"
