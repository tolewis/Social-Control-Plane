#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Load .env
set -a
source .env 2>/dev/null || true
set +a

case "${1:-all}" in
  api)
    exec corepack pnpm --filter @scp/api dev
    ;;
  worker)
    exec corepack pnpm --filter @scp/worker dev
    ;;
  web)
    exec corepack pnpm --filter @scp/web dev
    ;;
  all)
    echo "Starting API..."
    bash "$0" api &>/tmp/scp-api.log &
    echo "Starting Worker..."
    bash "$0" worker &>/tmp/scp-worker.log &
    echo "Starting Web..."
    bash "$0" web &>/tmp/scp-web.log &
    echo "All services starting. Logs in /tmp/scp-*.log"
    echo "API: http://localhost:4001"
    echo "Web: http://localhost:3000"
    wait
    ;;
esac
