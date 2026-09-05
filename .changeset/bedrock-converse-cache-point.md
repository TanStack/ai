---
'@tanstack/ai-bedrock': minor
---

Add prompt-cache checkpoints to the Bedrock Converse adapter.

Set `metadata.cachePoint` on a system prompt, a text content part, or a tool. The adapter places a Bedrock `cachePoint` block right after that item. This block makes the preceding prompt eligible for caching. A later request can read matching tokens at the reduced cache rate. Bedrock bills tokens that miss the cache at the standard input rate. `{ type: 'default' }` uses the 5-minute TTL. Add `ttl: '1h'` for the 1-hour cache. A request may carry up to four checkpoints.
