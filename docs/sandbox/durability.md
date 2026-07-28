---
title: Sandbox Instance Durability
id: sandbox-durability
order: 9
description: "Durable sandbox instance resume across processes with SandboxInstanceStore and withSandboxInstanceStore."
---

Your agent runs behind more than one server instance, or at the edge. A run
spins up a sandbox, clones the repo, installs deps, does its work. The next run
for the same thread should pick that sandbox back up. Instead it builds a fresh
one every time and pays the whole cold-start cost again.

[Lifecycle & Snapshots](./lifecycle) already knows how to resume, but its
bookkeeping is in-memory, so it only holds within one process. The moment a run
lands on a different replica (or a fresh isolate), that instance has never seen
the sandbox and re-creates it.

**Sandbox instance durability** is runtime placement — not chat history. It is
owned by `@tanstack/ai-sandbox`, independent of `@tanstack/ai-persistence`
(transcript / runs / interrupts). You may share a database with chat stores, but
you compose a separate middleware.

Two pieces:

- **`SandboxInstanceStore`**: map of compound key → provider sandbox id (+
  optional snapshot). Durable, shared across instances.
- **`LockStore`** (from `@tanstack/ai/locks`): mutual exclusion around resume-or-create.
  Multi-instance needs a distributed lock. See [Locks](../advanced/locks).

## Wire it up

Middleware order: **providers before** `withSandbox`.

```ts
import { chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  withSandbox,
  withSandboxInstanceStore,
} from '@tanstack/ai-sandbox'
import type { ModelMessage } from '@tanstack/ai'

// Single-process: in-memory is fine for local dev.
// Multi-instance: your durable SandboxInstanceStore + distributed LockStore.
const instanceStore = new InMemorySandboxInstanceStore()
const messages: Array<ModelMessage> = [{ role: 'user', content: 'hi' }]

const sandbox = defineSandbox({
  id: 'repo',
  provider: {
    name: 'example',
    capabilities: () => ({
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: false,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    }),
    create: () => {
      throw new Error('example provider — wire a real SandboxProvider')
    },
    resume: () => Promise.resolve(null),
    destroy: () => Promise.resolve(),
  },
  workspace: defineWorkspace({ source: { type: 'none' } }),
})

chat({
  adapter: grokBuildText('grok-build'),
  messages,
  middleware: [
    withSandboxInstanceStore(instanceStore),
    withLocks(new InMemoryLockStore()),
    withSandbox(sandbox),
  ],
})
```

With `reuse: 'thread'` (the default), the first run creates and records the
instance. A later run for the same `threadId` resumes it when the store (and
lock) are shared across processes.

Optional chat persistence is independent:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'
import {
  withSandbox,
  withSandboxInstanceStore,
} from '@tanstack/ai-sandbox'
import type { SandboxInstanceStore } from '@tanstack/ai-sandbox'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

declare const instanceStore: SandboxInstanceStore
declare const sandbox: SandboxDefinition

const middleware = [
  withPersistence(memoryPersistence()), // chat state only
  withSandboxInstanceStore(instanceStore),
  withLocks(new InMemoryLockStore()), // multi-instance: distributed LockStore
  withSandbox(sandbox),
]
```

## Implement `SandboxInstanceStore`

```ts
import {
  defineSandboxInstanceStore,
} from '@tanstack/ai-sandbox'
import type { SandboxInstanceRecord } from '@tanstack/ai-sandbox'

export const instanceStore = defineSandboxInstanceStore({
  async get(_key) {
    return null
  },
  async upsert(_record: SandboxInstanceRecord) {
    // insert or FULLY replace by record.key
  },
  async delete(_key) {
    // no-op if missing
  },
})
```

### Invariants (conformance)

```ts
import {
  runSandboxInstanceStoreConformance,
} from '@tanstack/ai-sandbox/testkit'
import type { SandboxInstanceStore } from '@tanstack/ai-sandbox'

declare const instanceStore: SandboxInstanceStore

runSandboxInstanceStoreConformance('my-instance-store', () => instanceStore)
```

| Method | Invariant |
| --- | --- |
| `get` | Missing key → `null` (not throw). |
| `upsert` | **Full replace** by `record.key`. Omitted optionals clear prior values. |
| `delete` | Missing key is a **no-op**. |
| timestamps | `updatedAt` is epoch **milliseconds**. |

### Suggested schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS sandbox_instances (
  key text PRIMARY KEY NOT NULL,
  provider text NOT NULL,
  provider_sandbox_id text NOT NULL,
  latest_snapshot_id text,
  thread_id text NOT NULL,
  latest_run_id text,
  updated_at integer NOT NULL
);
```

You can put this table next to chat tables in the same DB — that is an **app**
choice, not a requirement of `@tanstack/ai-persistence`.

## Locks

A durable instance map without a distributed lock is still wrong across
replicas. Pair `withSandboxInstanceStore` with `withLocks` from `@tanstack/ai/locks`.
Full guide: [Locks](../advanced/locks).

## See also

- [Locks](../advanced/locks)
- [Lifecycle](./lifecycle)
- [Persistence overview](../persistence/overview) — chat state only
