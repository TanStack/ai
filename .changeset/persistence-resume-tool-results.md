---
'@tanstack/ai-persistence': patch
---

Store a tool result once when a run resumes from a client-tool interrupt. The client posts earlier tool results under interrupt snapshot ids the store never saw, so `withPersistence` appended a second copy and the next provider request failed.
