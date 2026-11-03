# The desktop that the model uses: a screen, the tools of the sandbox
# computer driver, Chromium, and the sign-in script.
# Build it from the example folder: docker build -t computer-use-login-desktop sandbox
FROM debian:bookworm-slim

RUN printf 'Acquire::Retries "10";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80retries \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    xvfb xdotool scrot x11-utils chromium fonts-dejavu-core \
    python3 python3-websockets ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The model sees the screen and moves the mouse. So Chromium must never show
# a password: no password manager, and no `javascript:` URLs.
# (A DevTools policy would also close the debugging port that login.py uses.)
COPY policy.json /etc/chromium/policies/managed/policy.json
COPY desktop.sh browser.sh login.py /opt/desktop/
RUN chmod +x /opt/desktop/desktop.sh /opt/desktop/browser.sh
