---
title: Sandbox Runs
id: sandbox-runs
---

Use sandbox persistence when a coding-agent harness needs to resume the same
sandbox across processes, not just within one Node.js process. The bridge
package connects core `AIPersistence` stores to the sandbox layer without making
either package depend directly on the other.

## Install the bridge

```sh
pnpm add @tanstack/ai-sandbox-persistence
```

You also need a SQL driver from the persistence backend you already use for
`withPersistence(...)`.

## Create a durable sandbox store

```ts
import { createSqliteDriver } from '@tanstack/ai-persistence-sqlite'
import { createSqlSandboxStore } from '@tanstack/ai-sandbox-persistence'

const driver = createSqliteDriver({ path: '.tanstack-ai/state.sqlite' })
const sandboxStore = createSqlSandboxStore(driver)
```

`createSqlSandboxStore(...)` creates the `sandbox_instances` table lazily. It
stores the sandbox instance key, provider id, provider sandbox id, latest
snapshot id, thread id, latest run id, and update time.

## Bridge persistence into `withSandbox`

Place `withPersistenceBridge(...)` after `withPersistence(...)` and before
`withSandbox(...)`.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence, createSqliteDriver } from '@tanstack/ai-persistence-sqlite'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import {
  createSqlSandboxStore,
  withPersistenceBridge,
} from '@tanstack/ai-sandbox-persistence'
import type { ModelMessage } from '@tanstack/ai'

const dbPath = '.tanstack-ai/state.sqlite'
const persistence = sqlitePersistence({ path: dbPath })
const sandboxStore = createSqlSandboxStore(createSqliteDriver({ path: dbPath }))

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
})

const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Resume this repository task.' },
]

chat({
  threadId: 'thread-123',
  runId: 'run-123',
  adapter: claudeCodeText('claude-sonnet-4-6'),
  messages,
  middleware: [
    withPersistence(persistence),
    withPersistenceBridge({
      persistence,
      sandboxStore,
    }),
    withSandbox(repoSandbox),
  ],
})
```

The bridge provides the durable sandbox store and, when present, the persistence
lock store. The sandbox layer uses those capabilities to resume an existing
provider sandbox and to serialize ensure/resume work across processes.

## Locks

If the persistence backend exposes `stores.locks`, the bridge provides it to the
sandbox layer. On Cloudflare, that usually means using Durable Object locks. On
Node, use a backend-specific lock store when your deployment has more than one
process that can resume the same sandbox key.

Without a durable lock, two workers may try to ensure the same sandbox at the
same time. Without a durable sandbox store, resume only works inside the process
that still has the in-memory record.

## Harness resume

Persistence replay and sandbox resume are separate pieces that work together.
`withPersistence` replays the public event tail for the chat client. The
sandbox store lets `withSandbox` find the same provider sandbox. A harness
adapter that supports reattach can then reconnect to the still-running agent
process and continue live after replay.
