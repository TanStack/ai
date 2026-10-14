---
'@tanstack/openai-base': patch
---

Responses API usage now reports `promptTokensDetails.cacheWriteTokens` from `input_tokens_details.cache_write_tokens`, the same as the Chat Completions path.
