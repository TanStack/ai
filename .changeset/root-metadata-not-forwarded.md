---
'@tanstack/ai-openrouter': patch
'@tanstack/ai': patch
---

fix(ai-openrouter): stop forwarding root observability `metadata` to the provider wire request (#735)

The OpenRouter chat-completions adapter (since 0.13.0) and responses adapter (since 0.9.0) copied `chat()`'s root-level observability `metadata` onto the wire as `chatRequest.metadata` / `responsesRequest.metadata`. The `@openrouter/sdk` validates those fields as `Record<string, string>`, so structured observability metadata (objects, arrays — the documented usage for middleware/devtools consumers) failed client-side Zod validation with `Input validation failed` on every call. The spread also clobbered an intentional, correctly-typed `modelOptions.metadata`.

Root `metadata` is observability-only again (middleware, devtools, event client) and `modelOptions.metadata` is the sole source for OpenRouter wire metadata, matching every other adapter. The `TextOptions.metadata` doc comment in `@tanstack/ai` now states this contract explicitly.
