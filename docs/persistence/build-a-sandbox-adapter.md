---
title: Build a Sandbox Adapter (Advanced)
id: sandbox-build-an-adapter
order: 15
description: "Choose what survives restart: sandbox side, conversation, both, or neither. Implement SandboxInstanceStore + prove with conformance."
keywords:
  - SandboxInstanceStore
  - withSandbox persistence
  - store sandbox runs
  - sandbox conformance suite
  - defineSandboxInstanceStore
---

# Build a Sandbox Adapter

If you need sandboxed agent runs to survive restart/replica/tab close → pick a posture, implement stores, run conformance.

Two halves persist separately:

1. **Sandbox side** — which provider sandbox to resume, run still going?, event log
2. **Conversation** — messages the UI paints

Does not require chat/generation store contracts. Related: [chat adapter](./build-your-own-chat-adapter), [generation adapter](./build-your-own-generation-adapter).

## Decide what you store

| Keep | Wire | Get | Give up |
| --- | --- | --- | --- |
| Everything | `withPersistence` + `withSandbox` (`instances`, `runs`, `durability`) | Transcript + tool cards + in-flight run on any device | Store size (tool output can be large) |
| Sandbox only | `withSandbox` only (`instances`, `runs`, `durability`) | Refresh/takeover/sandbox reuse | No transcript history |
| Chat only | `withPersistence` alone | Conversation returns | No sandbox reuse/takeover |
| Neither | no middleware | — | Cold sandbox every run |

"Sandbox only" when text is sensitive (ids/timestamps only). Transcript tool-call trim: [Trim what you keep](../sandbox/events#trim-what-you-keep).

## Keep everything

**Must:** same `RunStore` on both middlewares.

```ts
import { chat } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { persistence } from './persistence'
import { instances } from './instances'
import { locks } from './locks'
import { sandbox } from './sandbox'

export function agentRun(input: {
  messages: Array<{ role: 'user'; content: string }>
  threadId: string
  runId: string
}) {
  return chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
    middleware: [
      withPersistence(persistence),
      withLocks(locks), // before withSandbox: serialize resume-or-create
      withSandbox(sandbox, {
        instances,
        runs: persistence.stores.runs, // SAME store
      }),
    ],
  })
}
```

Detachable/replayable: add `durability` — [Takeover & Detached Runs](../sandbox/takeover).

## Keep only the sandbox side

**Must:** `RunStore` (core contract) + `SandboxInstanceStore`. No message store.

```ts
import { chat } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instances'
import { locks } from './locks'
import { runs } from './runs'
import { sandbox } from './sandbox'

export function agentRun(input: {
  messages: Array<{ role: 'user'; content: string }>
  threadId: string
  runId: string
}) {
  return chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
    middleware: [
      withLocks(locks),
      withSandbox(sandbox, { instances, runs }),
    ],
  })
}
```

Client can `findActiveRun` + tail remainder; cannot repaint prior history.

## Keep only the conversation

`withPersistence` alone. Leave `instances` / `runs` / `durability` off `withSandbox` → fresh sandbox per run, destroyed with socket. Nothing to implement.

## Implement `SandboxInstanceStore`

**Required methods + invariants:**

| Method | Invariant |
| --- | --- |
| `get` | Missing key → `null` (never throw) |
| `upsert` | **Full replace** by `record.key`. Omitted optionals **clear** prior values |
| `delete` | Missing key → no-op |
| timestamps | `updatedAt` = epoch **ms** |

```ts
import { defineSandboxInstanceStore } from '@tanstack/ai-sandbox'
import { db } from './db'

export const instances = defineSandboxInstanceStore({
  get: (key) => db.sandboxInstances.findByKey(key),
  upsert: (record) => db.sandboxInstances.replace(record),
  delete: (key) => db.sandboxInstances.remove(key),
})
```

```sql
CREATE TABLE sandbox_instances (
  key                 TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  provider_sandbox_id TEXT NOT NULL,
  latest_snapshot_id  TEXT,
  thread_id           TEXT NOT NULL,
  latest_run_id       TEXT,
  updated_at          INTEGER NOT NULL
);
```

Same DB as chat tables is optional. Library never schedules deletes — you reap ([Reaping & Retention](../sandbox/reaping)).

```ts
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instances'
import { sandbox } from './sandbox'

export const middleware = [withSandbox(sandbox, { instances })]
```

## Four durable-run fields on `RunStore`

Optional columns; chat-only apps omit them.

| Field | Written by | Dropping it breaks |
| --- | --- | --- |
| `sandboxKey` | `withSandbox` on detach | Detached sandbox never reclaimed |
| `detachedSince` | detach / clear on re-attach | Reaper cannot tell abandoned vs live |
| `cancelRequested` | `requestRunCancel` | Stop cannot reach another replica’s run |
| `driverEpoch` | host that claims run | Takeover fence fails (dual drivers) |

**Critical:** `update` distinguishes **omitted** key (leave column) vs key with **`undefined`** (clear). Filtering `undefined` out of `SET` makes runs look permanently detached.

```ts
import type { RunRecord } from '@tanstack/ai'

export function detachedSinceColumn(
  patch: Partial<RunRecord>,
  sets: Array<string>,
  params: Array<unknown>,
): void {
  if ('detachedSince' in patch) {
    sets.push('detached_since = ?')
    params.push(patch.detachedSince ?? null)
  }
}
```

```ts
import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
import { persistence } from './persistence'

runDurableRunFieldsConformance('my postgres runs', () => persistence.stores.runs)
```

`listReclaimable` optional — without it `reapDetachedRuns` logs and sweeps nothing. [Reaping](../sandbox/reaping).

## Prove with conformance

```ts
import { runSandboxInstanceStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { freshDb } from './test-db'

runSandboxInstanceStoreConformance('postgres', async () => {
  const db = await freshDb()
  return db.sandboxInstances
})
```

| Suite | Proves |
| --- | --- |
| `runJournalConformance` | Journal file successor can replay — [Journal](../sandbox/journal) |
| `runTakeoverConformance` | Second host adopts; remainder once — [Takeover](../sandbox/takeover) |
| `runReaperConformance` | Abandoned finalized; live left alone — [Reaping](../sandbox/reaping) |

## Next

- [Sandbox Instance Durability](../sandbox/durability) — wiring + locking
- [Events](../sandbox/events) — transcript contents + trim
- [Durable Runs Explained](../sandbox/durable-runs) — plain language
