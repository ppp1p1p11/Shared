#!/usr/bin/env bash
# Rebuild the web export and (re)start the static server on :8081.
set -e
OUT=${1:-dist-web}
PIDFILE=${TMPDIR:-/tmp}/rolo-serve.pid
[ -f "$PIDFILE" ] && kill "$(cat $PIDFILE)" 2>/dev/null || true
rm -rf "$OUT"
npx expo export --platform web --output-dir "$OUT" > ${TMPDIR:-/tmp}/rolo-export.log 2>&1 || { tail -30 ${TMPDIR:-/tmp}/rolo-export.log; exit 1; }
tail -1 ${TMPDIR:-/tmp}/rolo-export.log
nohup node scripts/serve-web.mjs "$OUT" 8081 > ${TMPDIR:-/tmp}/rolo-serve.log 2>&1 &
echo $! > "$PIDFILE"
sleep 1
