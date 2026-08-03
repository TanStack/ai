---
'@tanstack/ai-persistence': minor
'@tanstack/ai-client': minor
---

`GenerationRunRecord.threadId` is now required.

```diff
  interface GenerationRunRecord {
    runId: string
-   threadId?: string
+   threadId: string
    …
  }
```

`GenerationRunStore.createOrResume` requires it on its input, and the
`resumeState` cursor on the hydration payload (`ReconstructedGeneration`,
`GenerationHydrationResult`) narrows from `{ threadId?: string; runId: string }`
to `{ threadId: string; runId: string }`.

**Why.** The optional field described a record no code path could produce and no
client would accept. `withGenerationPersistence` already refused to start a run
without a scope, so every record the library writes has one.
`findLatestForThread` — the only query that hydrates a generation — keys on it,
so a record without one could be written and then never read back. And the
client discarded any snapshot that arrived without one.

That last disagreement was a silent failure: the server legitimately omitted
`threadId` for a record that had none, and the client's snapshot validation
responded by dropping the **entire** snapshot (status, result and error along
with the cursor), leaving a blank idle panel with no diagnostic while the
provider kept billing. Making the field required removes the disagreement by
construction rather than patching one side of it.

**Migration.** If you wrote a `GenerationRunStore`, make the column non-nullable
and stop defaulting the field to `null`/`undefined`. The conformance suite now
asserts `threadId` round-trips exactly and is not mutated by an idempotent
`createOrResume`, so re-running it against your adapter will catch anything
missed. Records already stored without a `threadId` were unreachable by
`findLatestForThread`, so there is nothing to backfill for hydration to work —
delete them or assign them a scope.
