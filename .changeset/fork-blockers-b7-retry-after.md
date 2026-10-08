---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
'@tanstack/openai-base': patch
'@tanstack/ai-anthropic': patch
---

Model errors can carry the wait that the provider asks for.

- `@tanstack/ai`: a `RUN_ERROR` event can have `retryAfterMs`. The new `toRetryAfterMs` helper on `@tanstack/ai/adapter-internals` reads it from the `retry-after-ms` or `retry-after` header.
- `@tanstack/openai-base` and `@tanstack/ai-anthropic`: the text adapters set `retryAfterMs` on a `RUN_ERROR`.
- `@tanstack/ai-harness`: `ModelErrorContext.error` has `retryAfterMs`. `retryTransientErrors()` waits that long, and does not retry above `maxRetryAfterMs` (default 15 minutes).
- `@tanstack/ai-harness`: `partial` is true when the failed call streamed text, reasoning, or a tool call.
- `@tanstack/ai-harness`: the continue note has `metadata: { tanstack: { synthetic: true } }`, so a UI can hide it.
