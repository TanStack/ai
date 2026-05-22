---
'@tanstack/ai-openrouter': patch
---

Restore `web_fetch` in `OpenRouterChatModelToolCapabilitiesByName` so `webFetchTool()` is assignable to OpenRouter text adapters again. The recent model-metadata sync (#623) regenerated this map with `web_search` only, breaking the per-model type-safety tests added in #611.
