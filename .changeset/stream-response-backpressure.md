---
'@tanstack/ai': patch
---

Pause SSE and NDJSON response sources when their readers fall behind. Durable responses do not pause, so their runs keep writing to their logs.
