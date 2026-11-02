---
'@tanstack/ai-ollama': minor
---

Forward the new optional embedding `abortSignal` to the embed request. An injected `Ollama` client cannot take a per-call signal, so `embed()` only rejects on abort for it.
