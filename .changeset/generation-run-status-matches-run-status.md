---
'@tanstack/ai-persistence': minor
---

`GenerationRunStatus` now uses the same vocabulary as chat's `RunStatus`.

```diff
- type GenerationRunStatus = 'running' | 'complete' | 'error' | 'interrupted'
+ type GenerationRunStatus = RunStatus // 'running' | 'completed' | 'failed' | 'interrupted'
```

The two enums described the same four lifecycle states under different names,
`complete` against `completed` and `error` against `failed`, for no reason
either one could point at. An adapter storing both kinds of run had to keep two
status vocabularies straight, and a shared `status` column needed two sets of
checks. They are now one type, so one column and one check constraint cover both
tables.

If you wrote a `GenerationRunStore` against the old names, update the two
literals your store maps or validates. `running` and `interrupted` are
unchanged. The conformance suite round-trips both new literals — it writes
`completed` and then `failed` through `update` and reads each back through
`get` — so re-running it against your adapter will catch anything missed.

The client-facing resume-snapshot status is **unchanged**
(`idle | running | complete | error`). It is a separate vocabulary with its own
`idle` state, mapped from the store status by `reconstructGeneration`, exactly
as chat maps `RunStatus` to `ChatClientState`. Nothing on the wire moves.

Also corrected: `GenerationRunRecord.threadId` was documented as an "optional
link to the chat conversation that triggered this generation", and typed
optional to match. It is the slot the run fills, the stable app-chosen key
`findLatestForThread` hydrates by, and `withGenerationPersistence` refuses to
start a run without one — so the field is now **required**. A record written
without a scope could never be found again, which is not a shape worth keeping
representable.
