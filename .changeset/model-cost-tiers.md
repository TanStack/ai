---
'@tanstack/ai-models': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
---

Price long context and 1-hour cache writes in `modelCost`. A record's `cost.tiers` (from models.dev) holds higher prices above an input size, and a call uses the tier with the highest `inputTokensAbove` below its input. `TokenCounts.cacheWrite1h`, the part of `cacheWrite` with a 1-hour retention, costs 2 times the input price.

Usage reports that part as `promptTokensDetails.cacheWrite1hTokens`. The Anthropic adapter reads it from `cache_creation.ephemeral_1h_input_tokens`, and the Bedrock Converse adapter from the 1-hour `cacheDetails`.
