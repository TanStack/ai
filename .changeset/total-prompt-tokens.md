---
'@tanstack/ai-anthropic': minor
'@tanstack/ai-bedrock': minor
'@tanstack/ai-claude-code': minor
---

`usage.promptTokens` is now the total input on the Anthropic, Bedrock Converse, and Claude Code adapters. It is the uncached tokens plus the cache reads plus the cache writes. Before, it was the uncached tokens only. `totalTokens` now uses the new `promptTokens`. The cache parts stay in `promptTokensDetails.cachedTokens` and `promptTokensDetails.cacheWriteTokens`. Other adapters already report `promptTokens` this way.

**Breaking:** if your code adds `cachedTokens` or `cacheWriteTokens` to `promptTokens` to get the total input, it now counts the cache two times. Use `promptTokens` as the total. To get the uncached tokens, subtract `cachedTokens` and `cacheWriteTokens` from `promptTokens`.
