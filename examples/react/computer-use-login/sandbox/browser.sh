#!/bin/sh
# Stop or start Chromium, so a snapshot saves or restores a complete profile.
# `stop` pauses the loop in desktop.sh, then waits until Chromium has exited.
# `start` ends the pause, then waits until Chromium answers on its debugging port.
set -e
PAUSE=/tmp/chromium-paused
case "$1" in
  stop)
    mkdir -p /root/chromium-profile
    touch "$PAUSE"
    # Browser.close is a clean exit: Chromium writes its cookies to disk.
    # A signal (pkill) skips that, and the session cookies are lost.
    if pgrep -x chromium >/dev/null; then
      python3 - <<'PY'
import asyncio, json, urllib.request, websockets
url = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json/version"))["webSocketDebuggerUrl"]
async def close():
    async with websockets.connect(url) as socket:
        await socket.send(json.dumps({"id": 1, "method": "Browser.close"}))
        await socket.recv()
asyncio.run(close())
PY
    fi
    for i in $(seq 100); do pgrep -x chromium >/dev/null || exit 0; sleep 0.2; done
    echo 'Chromium did not stop.' >&2
    exit 1
    ;;
  start)
    rm -f "$PAUSE"
    for i in $(seq 150); do
      python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9222/json/version')" 2>/dev/null && exit 0
      sleep 0.2
    done
    echo 'Chromium did not start.' >&2
    exit 1
    ;;
  *)
    echo 'Use: browser.sh stop|start' >&2
    exit 2
    ;;
esac
