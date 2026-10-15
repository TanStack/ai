---
'@tanstack/ai-persistence': patch
---

Keep the durability batch hint off stored messages. With `snapshotStreaming`, `withPersistence` merged the metadata of every chunk into the snapshot rows, including the `metadata.tanstack.batch` hint of a CUSTOM event sent with `ctx.emitCustomEvent(name, value, { batch: true })`. A stopped or failed run then stored `batch: true` on its assistant message. The snapshot rows now take a copy of the chunk metadata without that hint. The other metadata of the event stays, and the chunk itself still carries the hint for durability batching.
