#!/usr/bin/env bash
set -euo pipefail

CHROME_BIN="${V3_REAL_CHROME:-/usr/bin/google-chrome}"
if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome executable not found: $CHROME_BIN" >&2
  exit 127
fi

# GitHub hosted runners occasionally fail to expose the DevTools endpoint fast
# enough when Chrome starts in headed/Xvfb mode. The regression suite drives
# Chrome exclusively through CDP, so headless mode preserves all assertions and
# screenshots while avoiding the flaky headed startup path.
exec "$CHROME_BIN" \
  --headless=new \
  --disable-background-networking \
  --disable-component-update \
  --disable-default-apps \
  --disable-extensions \
  --disable-sync \
  "$@"
