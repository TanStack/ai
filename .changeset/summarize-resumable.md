---
'@tanstack/ai': patch
'@tanstack/openai-base': patch
---

Make streaming `summarize()` resumable across a mid-run reload, like the media
activities. Additive, no public API change beyond two optional fields:

- `summarize()` (and `SummarizationOptions`) accept optional `runId` / `threadId`.
  When set on a streaming summarize, they are threaded into the wrapped chat so
  the emitted `RUN_STARTED` carries the caller's `runId` — letting a
  delivery-durable route key the run's log by the same id the client rejoins
  with, so a mount-time `joinRun` tails the run to completion instead of
  fast-failing on a mismatched (empty) log.
- `@tanstack/openai-base`'s Responses `chatStream` now honors
  `options.runId` for the AG-UI `RUN_STARTED` (mirroring how it already honors
  `options.threadId`), falling back to a generated id when unset.
