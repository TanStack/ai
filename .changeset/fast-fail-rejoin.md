---
'@tanstack/ai': minor
'@tanstack/ai-client': patch
---

Make a reload rejoin fast, robust, and repeatable.

- **`memoryStream` first-chunk deadline now defaults to 100ms** (was 30s). The
  common from-start join is a reload rejoining a run whose producer ran in a
  prior request: an in-flight run's log already holds chunks (it streams
  immediately, the deadline never applies), and an empty log means the run is
  gone — so failing fast lets the client re-enable input near-instantly instead
  of holding a dead connection open. Raise `firstChunkDeadlineMs` for a backend
  whose producer can legitimately start well after a joiner attaches.
- **`ChatClient` reload rejoin hardened:** it bounds the wait for the first
  chunk and clears a dead resume pointer (so a stale pointer can't pin the UI in
  a loading state and can't be retried on the next load); it drops the hydrated
  in-flight partial only when real content arrives (never on `RUN_STARTED`
  alone), so a rejoin that connects but delivers nothing can't leave an empty
  assistant bubble; and it no longer lets a replayed `RUN_STARTED` (which
  carries the provider run id) overwrite the persisted resume pointer with an id
  the durability log isn't keyed by — so a SECOND consecutive reload still
  re-attaches and continues.
