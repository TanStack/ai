---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-durable-stream': minor
---

Resumable streams: reconnect to an in-flight SSE response without re-running
the provider.

`toServerSentEventsResponse` accepts a `durability: { adapter, batch }` option.
The adapter (`StreamDurability`) records every chunk to an ordered log before
delivery and tags each SSE event with an opaque, adapter-owned `id:` offset. A
reconnect (`Last-Event-ID`) or an explicit `?offset` read replays strictly
after that offset from the log — the lazy provider stream is never iterated on
resume. Producers terminalize the log on completion, cancellation, and failure
(`RUN_ERROR` append + `close()`), so readers are never parked on a dead run.

Two adapters ship: `memoryStream(request)` in `@tanstack/ai` (process-local,
for development and tests) and the new `@tanstack/ai-durable-stream` package,
a Durable Streams protocol adapter for production backends.

On the client, `fetchServerSentEvents` is now resumable: it tracks SSE `id:`
values, auto-reconnects with `Last-Event-ID`, de-duplicates the replayed
prefix, and exposes `joinRun(runId)` to attach to an in-flight or finished run
from the start (read-only GET with `offset=-1`). Untagged streams behave
exactly as before. A durable run that ends with no terminal event and no
forward progress now throws `DurableStreamIncompleteError` instead of hanging.

Reconnection and durability are bounded so failures surface rather than hang or
loop:

- `memoryStream` evicts completed logs after a grace window (unbounded growth
  is gone); resuming an expired/unknown run throws, and a from-start join to a
  run that never produces fails after `MemoryStreamOptions.firstChunkDeadlineMs`.
- `fetchServerSentEvents` accepts `reconnect: { maxAttempts, delayMs }` — a
  throttle plus a total ceiling that fails with the new
  `StreamReconnectLimitError` instead of reconnecting endlessly.
- `durableStream` accepts `reconnect: { maxReadFailures, delayMs }` to bound its
  read-retry loop, and `server` is now optional when `fetch` is provided (e.g. a
  Cloudflare service binding).
- `toServerSentEventsResponse` accepts `debug` to record durability terminal /
  close failures server-side, where a replaying joiner cannot observe them.
