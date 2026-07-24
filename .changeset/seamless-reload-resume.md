---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-persistence': minor
---

Make a mid-stream reload resume the same conversation cleanly.

- `withPersistence` now persists the pending turn at the start of a run (so a
  reload during generation still shows the user's message), stamps each
  assistant turn with its stream `messageId`, and accepts
  `withPersistence(persistence, { snapshotStreaming: true })` to also persist the
  in-progress reply on a throttled interval (`snapshotIntervalMs`, default
  `1000`) for partial-output durability.
- `ModelMessage` gains an optional `id`; `modelMessagesToUIMessages` preserves
  it, so a hydrated message keeps the same identity as its live stream.
- On reload, the chat client rebuilds an in-flight assistant turn from the
  delivery log (replaying from the start and applying the buffered backlog in one
  batch) instead of reconciling against the persisted partial, so the reload
  shows one clean bubble that catches up and continues rather than a frozen or
  duplicated partial.
