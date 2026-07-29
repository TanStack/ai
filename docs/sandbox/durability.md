---
title: Sandbox Instance Durability
id: sandbox-durability
order: 9
description: "Durable sandbox instance resume across processes with a SandboxInstanceStore passed to withSandbox."
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

It is also not the agent's *output*. This page keeps a sandbox findable across
processes; keeping the run's event stream readable across processes is
[The Run Journal](./journal). The two compose: a resumed sandbox still holds the
journal of every run that executed in it, under `/tmp/tanstack-runs`.

Two pieces:

- **`SandboxInstanceStore`**: map of compound key → provider sandbox id (+
  optional snapshot). Durable, shared across instances.
- **`LockStore`** (from `@tanstack/ai/locks`): mutual exclusion around resume-or-create.
  Multi-instance needs a distributed lock. See [Locks](../advanced/locks).

## Wire it up

Hand the store to `withSandbox`. The lock is a separate middleware because other
middleware can share it, and it must come **before** `withSandbox`.

```ts
import { chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  withSandbox,
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
      killableProcesses: false,
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
    withLocks(new InMemoryLockStore()),
    withSandbox(sandbox, { instances: instanceStore }),
  ],
})
```

With `reuse: 'thread'` (the default), the first run creates and records the
instance. A later run for the same `threadId` resumes it when the store (and
lock) are shared across processes.

Single sandbox, nothing else sharing the lock? Pass both as options and skip the
extra middleware:

```ts
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instanceStore } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withSandbox(sandbox, {
    instances: instanceStore,
    locks: new InMemoryLockStore(), // multi-replica: a distributed LockStore
  }),
]
```

Optional chat persistence is independent:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instanceStore } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withPersistence(memoryPersistence()), // chat state only
  withLocks(new InMemoryLockStore()), // multi-replica: distributed LockStore
  withSandbox(sandbox, { instances: instanceStore }),
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
// The `defineSandboxInstanceStore(...)` result from the section above.
import { instanceStore } from './instance-store'

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
replicas: two concurrent runs for one thread both find no record and both
create. Pair the store with a lock, either `withLocks` from
`@tanstack/ai/locks` or the `locks` option above. Full guide:
[Locks](../advanced/locks).

## See also

- [The Run Journal](./journal): durability of a run's output, as opposed to its sandbox
- [Takeover & Detached Runs](./takeover): surviving a client disconnect — a
  detached run keeps its sandbox up, and `RunStore.sandboxKey` /
  `RunStore.detachedSince` is how a later host finds it again
- [Locks](../advanced/locks)
- [Lifecycle](./lifecycle)
- [Persistence overview](../persistence/overview) — chat state only
