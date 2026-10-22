---
title: Sandbox Instance Durability
id: sandbox-durability
order: 9
description: "Resume the same sandbox from any server process. Pass a SandboxInstanceStore and a lock to withSandbox."
---

Durability stores the sandbox for a thread. The next run on another server reuses it and skips the cold start.

[Lifecycle & Snapshots](./lifecycle) can resume a sandbox, but it keeps its records in memory, in one process. A `SandboxInstanceStore` keeps those records in shared storage, so every server finds the same sandbox.

## Wire it up

You need two pieces:

- **`SandboxInstanceStore`**: maps the compound sandbox key to the provider sandbox id (and an optional snapshot). It must be shared across servers.
- **`LockStore`** from `@tanstack/ai/locks`: makes sure that only one run at a time does resume-or-create. Across servers you need a distributed lock. See [Locks](../advanced/locks).

This sample uses the in-memory versions, which work in one process for local dev:

```ts
import { chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  InMemorySandboxInstanceStore,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Production: your durable store and a distributed LockStore.
const instances = new InMemorySandboxInstanceStore()
const locks = new InMemoryLockStore()

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
})

const stream = chat({
  threadId: 'thread-1',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'hi' }],
  middleware: [
    // The lock comes BEFORE withSandbox.
    withLocks(locks),
    withSandbox(sandbox, { instances }),
  ],
})
```

With `reuse: 'thread'` (the default), the first run creates the sandbox and records it. A later run for the same `threadId` resumes it, on any server that shares the store and the lock.

For production, replace both in-memory stores. To write your own `SandboxInstanceStore`, see [Build a Sandbox Adapter](../persistence/build-a-sandbox-adapter).

## How it works

- Instance durability is about where the sandbox runs. It is not chat history. `@tanstack/ai-sandbox` owns it, separate from `@tanstack/ai-persistence` (transcripts, runs, interrupts). You can use the same database for both, but each has its own middleware.
- It does not copy the workspace into your storage. When a new sandbox must rebuild finished files, artifacts, and the conversation, use [Keep Files After Reload](./portable-snapshots-configure).
- It does not keep the agent's output. To read a run's events from another process, see [The Run Journal](./journal).

The two work together. A resumed sandbox still holds the journal of every **durable** run that ran in it, under `/tmp/tanstack-runs`. A run is durable when `withSandbox` gets both `runs` and `durability`. A run without that opt-in leaves no journal file.

## Other ways to wire it

If nothing else shares the lock, pass both as options and skip `withLocks`:

```ts
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withSandbox(sandbox, {
    instances,
    locks: new InMemoryLockStore(), // multi-server: a distributed LockStore
  }),
]
```

Chat persistence is a separate middleware. Add it next to the sandbox:

```ts
import { withLocks, InMemoryLockStore } from '@tanstack/ai/locks'
import { withPersistence, memoryPersistence } from '@tanstack/ai-persistence'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instance-store'
import { sandbox } from './sandbox'

const middleware = [
  withPersistence(memoryPersistence()), // chat state only
  withLocks(new InMemoryLockStore()), // multi-server: a distributed LockStore
  withSandbox(sandbox, { instances }),
]
```

## Advanced

### Why you need a lock

A shared instance store without a distributed lock is still wrong across servers. Two runs for one thread can start at the same time. Both find no record, and both create a sandbox.

Pair the store with a lock: use `withLocks` from `@tanstack/ai/locks`, or the `locks` option. See [Locks](../advanced/locks).

### Implement `SandboxInstanceStore`

The store has three methods: `get`, `upsert`, and `delete`. Each has a rule that a conformance suite checks for you. [Build a Sandbox Adapter](../persistence/build-a-sandbox-adapter) shows the code, the table, and the suite. It also helps you choose how much a sandboxed run leaves behind.

### Related pages

- [Takeover & Detached Runs](./takeover): survive a client disconnect. A detached run keeps its sandbox up. A later server finds it again with `RunStore.sandboxKey` and `RunStore.detachedSince`.
- [Persistence overview](../persistence/overview): chat state only.
