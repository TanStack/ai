---
'@tanstack/ai-cloudflare': patch
---

`embed()` with more than 100 inputs no longer fails on Workers AI embedding models that accept 100 texts per request, such as the BGE models. The adapter now sends the inputs in sequential requests of at most 100 texts and returns the vectors in input order. An aborted signal stops the remaining requests. Models with a lower limit, such as `@cf/qwen/qwen3-embedding-0.6b`, can still reject large inputs.
