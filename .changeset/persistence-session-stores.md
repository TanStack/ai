---
'@tanstack/ai-persistence': minor
---

Add opt-in session stores. The chat and generation middleware work as before without them.

- `inbox` (`InboxStore`): the inputs a host accepted, with an idempotent `append` by `inputId`, `listPending`, `markApplied`, `markRejected`, and `get`.
- `log` (`LogStore`): an append-only session log with 14 methods, each with one object argument. Records: `append`, `read`, and `subscribe`. Ownership: `acquire`, `renew`, `release`, `setAffinity`, and `listOrphaned`. The input lane: `offer` and `offered`, consumed in the same write with `append({ consumes })`. Snapshots and lifecycle: `getSnapshot`, `putSnapshot`, `truncate`, and `deleteLog`. Each fenced write carries the epoch from `acquire`, and a write with an old epoch rejects with `OwnershipLostError`. A writer that never calls `acquire` uses `UNOWNED_EPOCH`. `append` rejects with `LogConflictError` when another writer took the position, and `read` rejects with `LogTruncatedError` before the truncation point. `memoryLogStore()` is the reference store. It is not part of `memoryPersistence()`. `memoryLogBackend()` lets two store instances share one log. The conformance kit needs `twin`, a second store set on the same backend, for the `log` cases across instances.
- `leases` (`LeaseStore`, `TurnLease`, `TurnLeaseKey`): turn leases from a system that already has them. `defineLeaseStore()` types a custom one, `memoryLeaseStore()` is the reference store, and the conformance testkit covers it. It is not part of `memoryPersistence()`.
- `workClaims` (`WorkClaimStore`): claims on threads that have pending work, with `claim`, `release`, and `listExpired`.
- `sessions` (`SessionIndexStore`): one index entry per tenant and thread. The key is `{ tenantId?, threadId }` (`SessionIndexKey`), so one thread id in two tenants is two entries. An entry has an `ownerId` and `members` (`SessionMember`, with the role `owner`, `member`, or `viewer`). The store has `get(key)`, `getVersioned(key)`, `upsert(entry)`, `upsertIf({ entry, revision })` for compare-and-set writes, `list`, and `delete(key)`, a hard delete. `list` reads one tenant, filters by member, parent thread, title `search`, `harness` name, and exact `metadata` values, and pages with a cursor.

`defineInboxStore`, `defineLogStore`, `defineWorkClaimStore`, and `defineSessionIndexStore` type an adapter. `memoryPersistence()` now also has `inbox`, `workClaims`, and `sessions`. `runPersistenceConformance` runs the cases of each session store when the store is present, so an existing backend needs no `skip` entry.

With `stores.sessions`, `withPersistence` writes one index entry for each subagent child (`subagent:<runId>`), in the tenant of its `tenantId` option. The entry has the parent thread, the tool call, and the `ownerId` and `harness` name of the parent entry. It has no members: access to a child goes through its top-level thread.

`loadChildTranscript(messages, subagentRunId, threadId)` reads the stored messages of a child agent run for a UI. It returns `undefined` for a child of another thread.
