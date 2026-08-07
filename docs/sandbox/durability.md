---
title: Sandbox Instance Durability
id: sandbox-durability
order: 9
description: "Resume the same sandbox across processes with SandboxInstanceStore + withSandbox."
---

If the next request lands on another replica and rebuilds a cold sandbox every time → pass a shared `SandboxInstanceStore` to `withSandbox`.

This is **runtime placement** (find the sandbox), not chat history ([persistence](../persistence/overview)) and not run **output** ([journal](./journal)). Compose them separately.

| Piece | Role |
| --- | --- |
| `SandboxInstanceStore` | key → provider sandbox id (+ optional snapshot) |
| `LockStore` | mutex around resume-or-create — distributed for multi-instance |

## Wire it

1. Put `withLocks` **before** `withSandbox` (or pass `locks` on `withSandbox`).
2. Pass `instances` to `withSandbox`.
3. Multi-replica: durable store + distributed lock (not in-memory).

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
      throw new Error('example provider: wire a real SandboxProvider')
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

With `reuse: 'thread'` (default): first run creates + records; later same `threadId` resumes when store/lock are shared.

### Locks only on sandbox

```ts
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instanceStore } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withSandbox(sandbox, {
    instances: instanceStore,
    locks: new InMemoryLockStore(), // multi-replica: distributed LockStore
  }),
]
```

### With chat persistence

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instanceStore } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withPersistence(memoryPersistence()),
  withLocks(new InMemoryLockStore()),
  withSandbox(sandbox, { instances: instanceStore }),
]
```

## Implement the store

Three methods: `get`, `upsert`, `delete`. Conformance suite + walkthrough → [Build a Sandbox Adapter](../persistence/build-a-sandbox-adapter).

## Footgun

**Cause:** shared instance map without a distributed lock.  
**Effect:** two concurrent runs both create.  
**Fix:** pair with [Locks](../advanced/locks).

## See also

- [Journal](./journal) — run output durability
- [Takeover](./takeover) — detach; find sandbox via `sandboxKey` / `detachedSince`
- [Lifecycle](./lifecycle) · [Persistence overview](../persistence/overview)
