---
'@tanstack/ai-persistence': minor
---

Add opt-in session stores. The chat and generation middleware work as before without them.

- `inbox` (`InboxStore`): the inputs a host accepted, with an idempotent `append` by `inputId`, `listPending`, `markApplied`, `markRejected`, and `get`.
- `credentials` (`CredentialStore`): API keys and OAuth tokens by scope and id. An `oauth` credential can keep the OAuth `client` it was issued to. `list` never returns secret values.
- `log` (`LogStore`): an append-only log per thread. `append` writes a batch at a position, all or nothing, and rejects with `LogConflictError` when another writer took that position. `read` and `subscribe` complete it. `memoryLogStore()` is the reference store. It is not part of `memoryPersistence()`.
- `leases` (`LeaseStore`, `TurnLease`, `TurnLeaseKey`): turn leases from a system that already has them.
- `workClaims` (`WorkClaimStore`): claims on threads that have pending work, with `claim`, `release`, and `listExpired`.
- `sessions` (`SessionIndexStore`): one index entry per thread, with `upsert`, `get`, `list`, and `delete`. `list` filters by parent thread, owner, title `search`, `harness` name, and exact `metadata` values, and pages with a cursor. The optional `getVersioned` and `upsertIf` give compare-and-set writes.

`defineInboxStore`, `defineCredentialStore`, `defineLogStore`, `defineWorkClaimStore`, and `defineSessionIndexStore` type an adapter. `memoryPersistence()` now also has `inbox`, `credentials`, `workClaims`, and `sessions`. `runPersistenceConformance` runs the cases of each session store when the store is present, so an existing backend needs no `skip` entry.

With `stores.sessions`, `withPersistence` writes one index entry for each subagent child (`subagent:<runId>`), with the parent thread, the tool call, and the owner and `harness` name of the parent entry.

`loadChildTranscript(messages, subagentRunId, threadId)` reads the stored messages of a child agent run for a UI. It returns `undefined` for a child of another thread.
