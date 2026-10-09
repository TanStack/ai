---
'@tanstack/ai': minor
'@tanstack/openai-base': patch
'@tanstack/ai-anthropic': patch
---

A `RUN_ERROR` now tells you how long the provider asks you to wait before a retry.

- `@tanstack/ai`: `RunErrorEvent` has a new `retryAfterMs` field, in milliseconds. `chat()` moves it to `metadata.tanstack.retryAfterMs`. The new `toRetryAfterMs(error)` helper on `@tanstack/ai/adapter-internals` reads the `retry-after-ms` header first, then the `retry-after` header in seconds or as an HTTP date.
- `@tanstack/openai-base` and `@tanstack/ai-anthropic`: the text adapters set `retryAfterMs` on a `RUN_ERROR` when the error response has one of these headers. This includes every adapter that uses `@tanstack/openai-base`.
