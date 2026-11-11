---
'@tanstack/ai-cohere': patch
---

Apply the configured request timeout (30 seconds by default) to Cohere rerank requests, including the response body. A timeout rejects with TimeoutError.
