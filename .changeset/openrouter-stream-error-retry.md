---
'@tanstack/ai-openrouter': patch
---

`chat({ retry })` now retries an OpenRouter provider error that arrives in the stream. OpenRouter can send status 200 before the provider fails. The error then comes as an error chunk that the SDK cannot retry. When the code of that chunk is in `retryCodes` (default `['5XX']`, add `'429'` to retry a rate limit), the `RUN_ERROR` of the Chat Completions adapter now has `retryAfterMs` set to the `initialInterval` of `retryConfig` (default 500). `chat()` retries it only when the call streamed no output yet. An error after part of the answer is not retried. `retryConfig: { strategy: 'none' }` turns this off.
