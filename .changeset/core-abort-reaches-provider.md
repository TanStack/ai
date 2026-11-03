---
'@tanstack/ai': patch
---

A cancel now stops the provider request, not only the caller. `summarize()` (also with `stream: true`, which now passes `abortSignal` and `timeout` to the adapter and reports a cancel to middleware `onAbort`, not `onError`), middleware `ctx.abort()` when the caller passed an `abortController` (adapter request, structured output, and `ctx.signal`), subagent children, `generateVideo` status polls, and aborted `toWebSocket` turns now stop when the run is cancelled.
