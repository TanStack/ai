# The smallest desktop the sandbox computer driver can use.
# xterm gives the model something to click and type into.
FROM debian:bookworm-slim
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    xvfb xdotool scrot x11-utils xterm \
  && rm -rf /var/lib/apt/lists/*
