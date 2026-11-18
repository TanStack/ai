---
'@tanstack/ai-mistral': patch
---

Mistral streams that end with `finish_reason: "error"` now end the run with `RUN_ERROR` instead of a clean `RUN_FINISHED`.
