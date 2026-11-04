---
'@tanstack/ai-sandbox-docker': minor
---

`snapshot(label, { signal })`, `fork({ signal })`, and `ports.connect(port, { signal })` pass the signal to dockerode as `abortSignal`, which aborts the Docker API request.
