---
'@tanstack/ai-persistence': minor
---

Extend the shared conformance testkit to the generation stores.

**Migration — every existing adapter must update its conformance call.** The suite now fails loudly on a store that is absent without being declared, so a chat-only adapter that used to pass unchanged will start failing on `generationRuns` / `artifacts` / `blobs`. Declare them absent:

```diff
- runPersistenceConformance('my-adapter', () => makePersistence())
+ runPersistenceConformance('my-adapter', () => makePersistence(), {
+   skip: ['generationRuns', 'artifacts', 'blobs'],
+ })
```

Drop an entry from `skip` as you implement that store — the suite then holds it to the contract below. Declaring absence is deliberate: a silently skipped store is how an adapter ships a `generationRuns` implementation that was never exercised.

`runPersistenceConformance` now exercises `generationRuns`, `artifacts`, and `blobs` alongside the four chat state stores, so a hand-rolled generation backend is held to the same gate as a chat one: `createOrResume` idempotency and `findLatestForThread` (latest by `startedAt`, thread-scoped, terminal runs included) on the run store; upsert `save`, `list(runId)` ordering, and `delete` / `deleteForRun` scoping on the artifact store; and byte/metadata round-trips, overwrite, silent absent-key `delete`, and `list` prefix + cursor paging on the blob store. Two invariants that were easy to get wrong and are now checked: `list`'s `prefix` matches **literally and case-sensitively** (a SQL backend using `LIKE` fails on both counts, since SQLite's `LIKE` is case-insensitive for ASCII and treats `%` / `_` as wildcards), and cursor paging visits every key exactly once.

`examples/ts-react-chat`'s self-contained `node:sqlite` adapter implements all seven stores and runs the full suite; its server-side generation route is backed by that adapter, so generated images survive a dev-server restart.
