---
'@tanstack/ai-openrouter': patch
---

Keep a reported reasoning token count of `0` in the usage. `structuredOutputStream()` now also puts the received token usage and cost on its `RUN_ERROR` event.
