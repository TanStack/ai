---
'@tanstack/ai': patch
'@tanstack/ai-openai': patch
---

Forward summarize maxLength through OpenAI-compatible adapters using the token-limit key for their API, regardless of the summarize wrapper name. Keep explicit caller limits unchanged.
