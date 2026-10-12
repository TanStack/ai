---
'@tanstack/ai': minor
---

`chat()` can now retry a rate-limited model call by itself. Pass `retry: { maxRetries, maxWaitMs? }`. When the provider sends a wait time (`retryAfterMs`) with an error, `chat()` waits that long, then calls the model again.

- It retries only when the provider sent a wait time.
- It does not retry when the wait is longer than `maxWaitMs` (default 60 000).
- It does not retry a call that already streamed output, so no output repeats.
- An abort stops the wait. You then get the `RUN_ERROR`.
- It does not retry the structured-output call.
- A `maxRetries` or `maxWaitMs` that is not valid throws a `TypeError`.

`retry` is off by default.

`chat()` now also sends `RUN_STARTED` before a `RUN_ERROR` when the adapter failed before it sent a start.
