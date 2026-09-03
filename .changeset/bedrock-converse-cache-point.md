---
'@tanstack/ai-bedrock': minor
---

Add prompt-cache checkpoints to the Bedrock Converse adapter.

Set `metadata.cachePoint` on a system prompt, a text content part, or a tool to place a Bedrock `cachePoint` block right after it. Bedrock caches everything before that block and reads it back at the cache rate on later requests. `{ type: 'default' }` uses the 5-minute TTL; add `ttl: '1h'` for the 1-hour cache. A request may carry up to four checkpoints.
