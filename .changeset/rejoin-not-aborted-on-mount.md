---
'@tanstack/ai-react': patch
---

Fix `useChat` aborting an in-flight delivery resume on mount. When `live` was
not enabled, the mount effect called `client.unsubscribe()` unconditionally,
which cancelled the shared in-flight stream — including the `joinRun` rejoin the
client had just started for a reloaded run. The result was a mid-stream reload
that caught up to the buffered point and then froze instead of continuing.
`useChat` now only tears down a subscription it actually started, so a reload
rejoins and streams the run through to completion.
