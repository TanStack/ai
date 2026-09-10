---
'@tanstack/ai-sandbox-cloudflare': patch
---

`exposePreview` now verifies the preview URL is actually reachable before returning it: it fails with an actionable error when nothing is listening on the port, and detects and replaces stale quick tunnels instead of re-sharing dead URLs (#992).
