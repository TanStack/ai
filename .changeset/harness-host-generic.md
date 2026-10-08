---
'@tanstack/ai-harness': minor
'@tanstack/ai-persistence': minor
---

Harness host features for frameworks that build on the harness:

- `host.open(harness, { threadId, logId })`: sessions that share one log. A record can name another session with `thread`, and `createHarnessHost({ reduce })` folds every host record of a log (`host.logState(logId)`).
- `durableTool(definition, execute, { replay: 'never' })`.
- `defineHarness({ turn: { onModelError, beforeFinish, maxFinishCycles, canJoin, onJoin } })`, `durability.recover`, `retryTransientErrors()`, and `isTransientModelError()`.
- `stores.leases` (`LeaseStore`): turn leases from your own system, in place of `stores.runs`.
- Durable tools that a middleware returns from `onConfig` get `step` and `append`.
- A waiting steer stops the join when it has an abort request, and `cancel` on it settles it `aborted`.
