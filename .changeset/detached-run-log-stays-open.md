---
'@tanstack/ai': patch
'@tanstack/ai-sandbox': patch
---

Fixed: a detached run's delivery log stays open, so a takeover can actually continue it.

The durable delivery sink behind `toServerSentEventsResponse` / `toHttpResponse` appended a synthetic terminal `RUN_ERROR` ("Request aborted") and called `durability.close()` on **every** abort. On a plain disconnect of a detachable run — the whole point of durable runs — that defeated the feature twice over:

- the log was terminalized, so a later attach's replay ended at the stored `RUN_ERROR` instead of continuing, and
- that `RUN_ERROR` is a chunk the takeover's journal replay cannot reproduce, so `alignToStoredLog` threw `JournalReplayDivergedError`, `pipeToRunLog` recorded the perfectly healthy detached run as `'failed'`, and appended a _second_ terminal error.

The sink now consults the run's own abort verdict. `withSandbox`'s `onAbort` publishes the new `RunDetachedCapability` on its detach branch — it is the only actor that has resolved both out-of-band cancel bands (`AbortInfo.cancelRequested` and `wasCancelRequested` on the record) plus `detachOnDisconnect` — and core carries the fact to the transport on the stream object itself, so there is nothing for an application to wire.

Only a plain, intentless disconnect of a detachable run is spared. An explicit cancel in either band, a disconnect on a non-detachable run, `detachOnDisconnect: false`, a genuine provider failure, and a normal finish all terminalize and close exactly as before — a run is never left with an open log and no successor. Core additionally refuses to treat an abort carrying `RUN_CANCEL_REASON` as a detach whatever a middleware claims, so a user pressing Stop always gets a closed, terminal log.
