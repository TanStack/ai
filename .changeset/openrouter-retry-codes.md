---
'@tanstack/ai-openrouter': patch
---

Add a `retryCodes` option to the OpenRouter text and summarize adapters. The adapter passes it to every chat request, so `retryCodes: ['429', '5XX']` together with `retryConfig` now retries rate limits. Before, the SDK retried only 5XX errors, because it reads `retryCodes` only per request.
