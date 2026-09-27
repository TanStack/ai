---
'@tanstack/openai-base': patch
---

Chat Completions usage now reads Moonshot (Kimi) prompt cache counts. `prompt_tokens_details.cache_write_tokens` maps to `promptTokensDetails.cacheWriteTokens`, and a `cached_tokens` field at the root of `usage` maps to `promptTokensDetails.cachedTokens` when `prompt_tokens_details.cached_tokens` is absent.
