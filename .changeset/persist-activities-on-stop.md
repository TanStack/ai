---
'@tanstack/ai-persistence': patch
---

`withPersistence` now saves activity rows when a run is stopped or fails, so `reconstructChat` restores them after a reload. A plain disconnect on a detachable or interrupted run still writes nothing.
