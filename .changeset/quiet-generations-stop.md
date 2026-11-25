---
'@tanstack/ai-client': patch
---

Cancel an idle SSE fetcher response when a generation client stops or is disposed, so the pending generation settles and releases its reader.
