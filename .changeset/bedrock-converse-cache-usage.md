---
'@tanstack/ai-bedrock': patch
---

Forward Bedrock Converse cache token counts to `TokenUsage`.

`cacheReadInputTokens` and `cacheWriteInputTokens` from the Converse `metadata.usage` event now land on `promptTokensDetails.cachedTokens` and `promptTokensDetails.cacheWriteTokens`, in `chatStream`, `structuredOutput`, and `structuredOutputStream`. Bedrock's `inputTokens` counts only the uncached part of the input, so without these fields a cached request looked like a near-zero-input call. Both fields are omitted when Bedrock omits them.
