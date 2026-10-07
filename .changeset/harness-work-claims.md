---
'@tanstack/ai-persistence': minor
'@tanstack/ai-harness': minor
---

A host can continue the work of hosts that stopped, without anyone opening the thread.

- `@tanstack/ai-persistence` has a new optional store, `WorkClaimStore` (`claim`, `release`, `listExpired`), with `defineWorkClaimStore`, conformance cases, and a memory version in `memoryPersistence()`.
- With `stores.workClaims`, a harness session claims its thread while the thread has work, renews the claim, and releases it when the thread is idle. A thread that waits for an approval or a sign-in is idle. A failed claim write is a `harness.plugin.warning` event, and the work goes on.
- `host.resumePending({ harnesses, close?, limit? })` opens each thread whose claim expired, and the session recovers its pending work. Two hosts that sweep at once never take the same thread. A swept session closes when its work ends (`close: 'whenIdle'`, the default, unless the app opened the thread too) or stays open (`'never'`). Call it at boot, and from a cron job or a Durable Object alarm.
