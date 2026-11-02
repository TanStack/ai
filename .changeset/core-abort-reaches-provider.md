---
'@tanstack/ai': patch
---

A cancel now stops the provider request, not only the caller. `summarize()` (also with `stream: true`, which now honors `abortSignal` and `timeout` and reports a cancel to middleware `onAbort`, not `onError`), middleware `ctx.abort()` (adapter request, structured output, and `ctx.signal`), subagent children, server tools that ignore their signal, `generateVideo` status polls, and aborted `toWebSocket` turns now stop when the run is cancelled.
