---
'@tanstack/ai-persistence': patch
---

With `snapshotStreaming`, `withPersistence` now keeps only the call metadata on snapshot rows, the same keys a finished message keeps. A stopped or failed row no longer stores other chunk metadata, such as the durability batch hint of `ctx.emitCustomEvent(name, value, { batch: true })`.
