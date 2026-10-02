#!/usr/bin/env bash
# Rebuild the web export and (re)start the static server on :8081.
set -e
OUT=${1:-/tmp/claude-0/web-export}
PIDFILE=/tmp/claude-0/serve.pid
[ -f "$PIDFILE" ] && kill "$(cat $PIDFILE)" 2>/dev/null || true
rm -rf "$OUT"
npx expo export --platform web --output-dir "$OUT" > /tmp/claude-0/export.log 2>&1 || { tail -30 /tmp/claude-0/export.log; exit 1; }
tail -1 /tmp/claude-0/export.log
nohup node scripts/serve-web.mjs "$OUT" 8081 > /tmp/claude-0/serve.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1
