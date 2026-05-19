---
'@tanstack/ai-openrouter': patch
---

Restore `OpenRouterChatModelToolCapabilitiesByName` export in `model-meta.ts` and emit it from the OpenRouter model generator so future syncs don't drop it.
