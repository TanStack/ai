---
'@tanstack/ai-ollama': patch
---

Aborting a chat now stops the Ollama stream when you pass your own `Ollama` client. Structured output with your own client still runs to the end, because `ollama` has no per-call signal.
