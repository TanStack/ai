---
'@tanstack/ai-cloudflare': patch
---

`embed()` with more than 100 inputs no longer fails on Workers AI embedding models. The adapter now sends the inputs in sequential requests of at most 100 texts, the per-request limit of the models, and returns the vectors in input order.
