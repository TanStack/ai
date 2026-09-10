---
id: RunStatus
title: RunStatus
---

# Type Alias: RunStatus

```ts
type RunStatus = "running" | "interrupted" | TerminalRunStatus;
```

Defined in: [packages/ai/src/activities/chat/middleware/run-store.ts:37](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/run-store.ts#L37)

Lifecycle status of one run (one agent turn within a conversation).

`interrupted` is a human-in-the-loop PAUSE that interrupt-resume continues
from — it is deliberately NOT terminal, and must never be conflated with
`aborted` (an explicit cancellation).

The two are now written by different hooks and cannot be confused:

- `'interrupted'` is written ONLY by `withPersistence`'s `onInterrupt`, and
  carries NO `finishedAt` (a non-terminal status has not finished).
- `'aborted'` is written by `withPersistence`'s `onAbort`, and only for an
  abort that is an explicit cancel or that is ending the run for good.
- A mere client disconnect on a run with durable storage wired writes
  NEITHER: the record stays `'running'` and gains `detachedSince`, because the
  agent is still running and a later attach can take it over.

Intent is never inferred from the abort itself — see `RUN_CANCEL_REASON` and
`requestRunCancel` in `../cancel`.
