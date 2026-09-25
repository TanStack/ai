---
'@tanstack/ai-persistence': minor
'@tanstack/ai': minor
---

Show how long each turn took after a reload.

- `withPersistence` records the run that produced each assistant message on `metadata.tanstack.run.id`.
- `reconstructChat(persistence, request, { includeRuns: true })` adds the finished run's `startedAt` and `finishedAt` to `metadata.tanstack.run` on those messages, and returns a top-level `runs` list. It needs a `runs` store that implements `listByThread`.
- `uiMessageToModelMessages` and `uiMessagesToWire` keep `metadata.tanstack.run.id`, so the tag survives the round trip from the client.
- `runPersistenceConformance` has a new `checks` option with two opt-in checks: `'messages.metadata'` and `'runs.listByThread.state'`. They are off by default, so an adapter that passed before still passes.
