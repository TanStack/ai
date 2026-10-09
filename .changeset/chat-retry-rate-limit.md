---
'@tanstack/ai': minor
---

`chat()` can now retry a rate-limited model call by itself. Pass `retry: { maxRetries, maxWaitMs? }`. When a `RUN_ERROR` has a `retryAfterMs`, `chat()` waits that long, then calls the model again.

- It retries only when the provider sent a wait time.
- It does not retry when the wait is longer than `maxWaitMs` (default 60 000).
- It does not retry a call that already streamed output, so no output repeats.
- An abort stops the wait.

`retry` is off by default.
