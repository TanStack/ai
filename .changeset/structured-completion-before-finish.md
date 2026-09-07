---
'@tanstack/ai': patch
'@tanstack/ai-client': patch
---

Emit the native structured result before RUN_FINISHED so clients receive the final object before the run closes. Emit only RUN_ERROR if parsing fails.

Wait for the active subscriber to process all events before resolving send, including streams that take more than 32 timer ticks to process.
