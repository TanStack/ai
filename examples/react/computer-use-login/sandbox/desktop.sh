#!/bin/sh
# The main process of the sandbox. It starts the screen and Chromium. When
# Chromium closes, it starts again. The profile folder keeps the cookies, so a
# restarted container is still signed in.
# Chromium listens for the debugging protocol on 127.0.0.1 inside the
# container only. The sign-in script uses it. No port leaves the container.
rm -f /tmp/.X0-lock
Xvfb :0 -ac -screen 0 1024x768x24 -nolisten tcp &
until DISPLAY=:0 xdpyinfo >/dev/null 2>&1; do sleep 0.2; done

while true; do
  # --no-sandbox: Chromium runs as root in the container, which is the sandbox.
  DISPLAY=:0 chromium --no-sandbox --test-type --no-first-run \
    --no-default-browser-check --disable-dev-shm-usage \
    --user-data-dir=/root/chromium-profile \
    --remote-debugging-port=9222 \
    --window-position=0,0 --window-size=1024,768 about:blank
  sleep 1
done
