#!/usr/bin/env bash
# Run the Lumen store with:
#   - auto-restart on any source change (tsx watch)
#   - auto-pull of merged fixes from GitHub (every 8s)
# So: merge a Capsule fix-PR on GitHub → ~8s later the local store is running the
# fixed code. Re-trigger the action in the store → it works.
cd "$(dirname "$0")/.." || exit 1

( while true; do git pull --ff-only -q >/dev/null 2>&1; sleep 8; done ) &
PULL=$!
trap 'kill "$PULL" 2>/dev/null' EXIT INT TERM

echo "[lumen] auto-pull + watch on. Merge a PR → the store restarts with the fix."
exec npx tsx watch src/server.ts
