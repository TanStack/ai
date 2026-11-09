---
'@tanstack/ai': patch
---

A `chat()` consumer that stops iterating (`break` or `return()`) now runs the middleware `onAbort` hook, so every run gets exactly one terminal hook. Stopping at a client-tool or approval pause's `RUN_FINISHED` chunk runs `onFinish`, as a drained pause does, so the paused state (such as a `withSandbox` sandbox) is kept.
