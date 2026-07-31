---
'@tanstack/ai': minor
---

`isTerminalRunStatus` no longer reports a prototype-chain property as terminal, and `isRunStatus` ships so a backend can validate a stored row.

`isTerminalRunStatus` tested `status in TERMINAL`, and `in` walks the prototype chain — so a store row whose `status` column held `'toString'`, `'constructor'`, or `'valueOf'` was reported **terminal**. `status` is typed `RunStatus`, but every value reaching the guard comes off a user-implemented `RunStore` (JSON out of D1, a Durable Object, Postgres) where nothing validated it, so the type was only a claim. A false `true` is destructive, not cosmetic: `@tanstack/ai-sandbox`'s journal sweep **deletes** a terminal run's journal — the only copy of the bytes a successor needs, with no undo — `attach-preflight` fails the attach as `'terminal-run'`, and core's resume driver refuses to drive the run.

- `isTerminalRunStatus` now uses `Object.hasOwn(TERMINAL, status)`, keeping the `Record<TerminalRunStatus, true>` exhaustiveness trick that makes adding a terminal status a compile error.
- **New: `isRunStatus(value: unknown): value is RunStatus`**, exported from `@tanstack/ai`, over the same exhaustiveness trick across the full union. Run it on a row's `status` at deserialization in your `RunStore` — the readers downstream act destructively on the answer. Core now does this at its own only store-status read (the resume driver), which refuses an unrecognized status and logs on the `errors` channel instead of coercing it.
- `DetachableRunCapability` and `RunDetachedCapability` are `createCapability<true>()` rather than `<boolean>`. Absence is the documented negative for both, so a published `false` had no meaning yet was representable — and a consumer testing _presence_ rather than the value would have read one as the positive. Narrowing the payload makes that unrepresentable. A provider that published `false` (which meant nothing) stops compiling; publish nothing instead.
