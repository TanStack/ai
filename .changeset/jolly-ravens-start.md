---
"@tanstack/ai-client": patch
---

Stamp synthesized RUN_FINISHED / RUN_ERROR with the client request runId so interrupt resume settles when the provider continuation omits a terminal event.
