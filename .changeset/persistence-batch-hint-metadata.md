---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

Middleware can read `ctx.callMetadata`, the `metadata.tanstack` of the current model call. Each assistant message of the call gets a copy of it.

With `snapshotStreaming`, `withPersistence` now stores `ctx.callMetadata` on snapshot rows, so a stopped or failed row has the same metadata as a finished one. A stopped or failed row no longer stores other chunk metadata, such as the durability batch hint of `ctx.emitCustomEvent(name, value, { batch: true })`.
