---
'@tanstack/ai-client': patch
---

Cancel fetch response bodies when SSE or NDJSON parsing fails, the consumer exits early, or SSE reaches a `[DONE]` marker. This closes unfinished connections and preserves the original error if cancellation fails.

Also cancel streaming generation responses when the client stops reading, including after a `RUN_ERROR` event.
