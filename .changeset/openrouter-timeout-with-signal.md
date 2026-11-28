---
'@tanstack/ai-openrouter': patch
---

OpenRouter requests now honor `timeoutMs` when the caller also passes an abort signal. Before, the timeout was dropped as soon as a signal was set, so a call with an abort signal could hang past the configured timeout.
