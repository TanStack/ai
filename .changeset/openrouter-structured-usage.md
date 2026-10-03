---
'@tanstack/ai-openrouter': patch
'@tanstack/ai': patch
---

Preserve reported zero reasoning tokens and include received token usage and cost on structured-output error events.

Clarify in the shipped middleware and structured-output skills that failed-call usage is available through `onChunk`, while `onUsage` handles `RUN_FINISHED`.
