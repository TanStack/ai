---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/openai-base': minor
---

Put the provider error type and the request id on `RUN_ERROR`. The Anthropic adapter and the adapters built on `@tanstack/openai-base` set `errorType` (for example `overloaded_error`) and `requestId` (from the SDK error or the `request-id` / `x-request-id` header). `chat()` moves both to `metadata.tanstack`, so the client gets them too. `code` stays the HTTP status. Adapter authors can read both values with `toRunErrorDetails` from `@tanstack/ai/adapter-internals`.
