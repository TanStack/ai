---
'@tanstack/ai-openrouter': patch
---

Keep `usage.cost` (and `costDetails`) from the OpenRouter Decisions API in `decide()` results. `result.meta.usage.cost` is now set, the same as with the OpenRouter text and image adapters.
