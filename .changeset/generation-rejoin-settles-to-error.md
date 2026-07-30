---
'@tanstack/ai-client': patch
---

A generation mount-time rejoin that can't finish now settles to `error` instead
of hanging on `generating`.

- `recordResumeSnapshotError` surfaces `error` on the observable `status` even
  when a streamed `RUN_ERROR` already flipped the resume snapshot to `error`
  (via `observeResumeSnapshot`). Previously its early-return skipped
  `setStatus`, so a rejoin whose delivery log had aged out (or whose route
  couldn't serve the join) left the hook stuck on `generating` forever. Guarded
  so the live `generate()` path doesn't double-emit `error`.
- `GenerationClient` / `VideoGenerationClient` `dispose()` no longer calls
  `stop()`: a teardown (unmount / React StrictMode dispose) must not mark the
  run non-resumable and wipe the `running` snapshot the way a user-driven
  `stop()` intentionally does — that destroyed the resume state so a remount
  could never rejoin. It now aborts only the in-flight delivery, keeps
  the snapshot resumable, and re-arms mount hydration so a remount rejoins.
