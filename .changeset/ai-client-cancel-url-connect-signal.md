---
'@tanstack/ai-client': minor
---

New optional cancel features. Old code works the same.

- `fetchServerSentEvents` and `fetchHttpStream` take an optional `cancelUrl`. With it, `ChatClient.stop()` sends `POST cancelUrl` with `{ runId, threadId }`, so the server can cancel a durable run. Only `stop()` sends it, not an unmount or a reload.
- Connection adapters can have an optional `cancelRun({ runId, threadId })` method. `stop()` calls it.
- `RealtimeClient` passes an `abortSignal` to `adapter.connect()`. A `disconnect()` during `connect()` aborts the setup, and the status goes to `idle`, not `error`.
