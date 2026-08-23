#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$ROOT_DIR/.studio-meadow"
LOG_DIR="$STATE_DIR/logs"
CONFIG_FILE="$ROOT_DIR/.studio-meadow.env"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8787}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
PUBLIC_URL="${PUBLIC_URL:-https://meadow.wuwayne.com}"
CLOUDFLARE_TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-studio-meadow}"

mkdir -p "$LOG_DIR"

usage() {
  cat <<EOF
Usage: ./studio-meadow.sh <command>

Commands:
  start     Build frontend, start frontend, backend, and Cloudflare tunnel
  stop      Stop frontend, backend, and Cloudflare tunnel
  restart   Stop, then start everything
  status    Show running service status
  logs      Tail service logs

Environment:
  FRONTEND_PORT=${FRONTEND_PORT}
  BACKEND_PORT=${BACKEND_PORT}
  PUBLIC_URL=${PUBLIC_URL}
  CLOUDFLARE_TUNNEL_NAME=${CLOUDFLARE_TUNNEL_NAME}
  CLOUDFLARE_TUNNEL_TOKEN=<token from Cloudflare dashboard>

Optional local config:
  Create .studio-meadow.env in this folder to store environment values.
EOF
}

start_all() {
  require_command npm
  require_command cloudflared

  echo "Building frontend..."
  (cd "$ROOT_DIR/apps/frontend" && npm run build)

  start_service "backend" "$BACKEND_PORT" "$ROOT_DIR/apps/backend" \
    env PORT="$BACKEND_PORT" npm run dev

  start_service "frontend" "$FRONTEND_PORT" "$ROOT_DIR/apps/frontend" \
    env PORT="$FRONTEND_PORT" STUDIO_MEADOW_API_BASE_URL="$BACKEND_URL" npm run dev

  start_tunnel

  echo ""
  echo "Local backend/frontend: $BACKEND_URL"
  echo "Local frontend dev:     http://localhost:${FRONTEND_PORT}"
  echo "Public QR URL:          $PUBLIC_URL"
  echo ""
  echo "TouchDesigner PNG folder:"
  echo "$ROOT_DIR/apps/backend/public/uploads/flowers"
}

stop_all() {
  stop_service "tunnel"
  stop_service "frontend"
  stop_service "backend"

  kill_port "$FRONTEND_PORT"
  kill_port "$BACKEND_PORT"
  kill_cloudflared_tunnel
}

restart_all() {
  stop_all
  start_all
}

status_all() {
  show_service_status "backend" "$BACKEND_PORT"
  show_service_status "frontend" "$FRONTEND_PORT"
  show_tunnel_status
}

tail_logs() {
  touch "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" "$LOG_DIR/tunnel.log"
  tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" "$LOG_DIR/tunnel.log"
}

start_service() {
  local name="$1"
  local port="$2"
  local cwd="$3"
  shift 3

  if is_pid_running "$(pid_file "$name")"; then
    echo "$name already running with PID $(cat "$(pid_file "$name")")."
    return
  fi

  local existing_pid
  existing_pid="$(port_pid "$port")"
  if [[ -n "$existing_pid" ]]; then
    echo "$name port $port is already in use by PID $existing_pid."
    echo "$existing_pid" >"$(pid_file "$name")"
    return
  fi

  echo "Starting $name..."
  (
    cd "$cwd"
    nohup "$@" >"$LOG_DIR/$name.log" 2>&1 &
    echo $! >"$(pid_file "$name")"
  )
}

start_tunnel() {
  if is_pid_running "$(pid_file tunnel)"; then
    echo "Cloudflare tunnel already running with PID $(cat "$(pid_file tunnel)")."
    return
  fi

  if pgrep -f "cloudflared tunnel run .*${CLOUDFLARE_TUNNEL_NAME}" >/dev/null 2>&1; then
    local existing_pid
    existing_pid="$(pgrep -f "cloudflared tunnel run .*${CLOUDFLARE_TUNNEL_NAME}" | head -n 1)"
    echo "Cloudflare named tunnel already running with PID $existing_pid."
    echo "$existing_pid" >"$(pid_file tunnel)"
    return
  fi

  echo "Starting Cloudflare named tunnel..."
  if [[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    nohup cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" >"$LOG_DIR/tunnel.log" 2>&1 &
  else
    nohup cloudflared tunnel run "$CLOUDFLARE_TUNNEL_NAME" >"$LOG_DIR/tunnel.log" 2>&1 &
  fi
  echo $! >"$(pid_file tunnel)"

  for _ in {1..20}; do
    if grep -q "Registered tunnel connection" "$LOG_DIR/tunnel.log" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
}

show_service_status() {
  local name="$1"
  local port="$2"
  local pid=""

  if [[ -f "$(pid_file "$name")" ]]; then
    pid="$(cat "$(pid_file "$name")")"
  fi

  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    echo "$name: running PID $pid on port $port"
    return
  fi

  local existing_pid
  existing_pid="$(port_pid "$port")"
  if [[ -n "$existing_pid" ]]; then
    echo "$name: running on port $port with PID $existing_pid"
    return
  fi

  echo "$name: stopped"
}

show_tunnel_status() {
  local pid=""
  if [[ -f "$(pid_file tunnel)" ]]; then
    pid="$(cat "$(pid_file tunnel)")"
  fi

  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    echo "tunnel: running PID $pid"
    echo "Public QR URL: $PUBLIC_URL"
    return
  fi

  if pgrep -f "cloudflared tunnel run .*${CLOUDFLARE_TUNNEL_NAME}" >/dev/null 2>&1; then
    echo "tunnel: running PID $(pgrep -f "cloudflared tunnel run .*${CLOUDFLARE_TUNNEL_NAME}" | head -n 1)"
    echo "Public QR URL: $PUBLIC_URL"
    return
  fi

  echo "tunnel: stopped"
}

stop_service() {
  local name="$1"
  local file
  file="$(pid_file "$name")"

  if ! is_pid_running "$file"; then
    rm -f "$file"
    return
  fi

  local pid
  pid="$(cat "$file")"
  echo "Stopping $name PID $pid..."
  kill "$pid" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi

  rm -f "$file"
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Stopping remaining process on port $port: $pids"
  kill $pids >/dev/null 2>&1 || true
}

kill_cloudflared_tunnel() {
  local pids
  pids="$(pgrep -f "cloudflared tunnel run .*${CLOUDFLARE_TUNNEL_NAME}" || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Stopping remaining Cloudflare named tunnel: $pids"
  kill $pids >/dev/null 2>&1 || true
}

pid_file() {
  echo "$STATE_DIR/$1.pid"
}

is_pid_running() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  local pid
  pid="$(cat "$file")"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

port_pid() {
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

case "${1:-}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  restart)
    restart_all
    ;;
  status)
    status_all
    ;;
  logs)
    tail_logs
    ;;
  *)
    usage
    exit 1
    ;;
esac
