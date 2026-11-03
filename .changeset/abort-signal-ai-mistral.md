---
'@tanstack/ai-mistral': patch
---

Aborting a chat now cancels the request to Mistral, for streaming and for structured output. Structured output keeps the `timeoutMs` limit when you pass a signal.
