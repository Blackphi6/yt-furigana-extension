#!/bin/bash
# Start the GitHub Actions self-hosted runner in Terminal.app (survives Cursor shells).
# Runner lives at /Volumes/SSD4/actions-runner (registered as mac-m3pro-Mac).
set -euo pipefail
ROOT="/Volumes/SSD4/actions-runner"
if [[ ! -x "$ROOT/run.sh" ]]; then
  echo "missing $ROOT/run.sh — register the runner first" >&2
  exit 1
fi
if pgrep -f "$ROOT/bin/Runner.Listener" >/dev/null; then
  echo "Runner.Listener already running"
  exit 0
fi
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT' && ./run.sh\""
echo "started Runner in Terminal.app"
