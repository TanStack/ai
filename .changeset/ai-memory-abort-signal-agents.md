---
'@tanstack/ai-memory': minor
---

`MemoryAdapter.recall(scope, query, { signal })` and `Embedder.embed(text, { signal })` take an optional signal. `memoryMiddleware` passes the chat run signal. `inMemory()`, `redis()`, and `mem0()` forward it.
