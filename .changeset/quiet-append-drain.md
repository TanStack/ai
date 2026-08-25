---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Keep `append()` pending until the HTTP response is fully processed, including later `RUN_FINISHED` events in the same agent loop.
