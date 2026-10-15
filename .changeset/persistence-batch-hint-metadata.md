---
'@tanstack/ai-persistence': patch
---

Keep the durability batch hint off stored messages. With `snapshotStreaming`, `withPersistence` merged the metadata of every chunk into the snapshot rows, including a CUSTOM event sent with `ctx.emitCustomEvent(name, value, { batch: true })`. A stopped or failed run then stored `metadata.tanstack.batch: true` on its assistant message. CUSTOM events no longer add metadata to the snapshot rows, so a stopped or failed row matches a finished one, which never takes CUSTOM metadata.
