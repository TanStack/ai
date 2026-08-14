---
title: Keep Files After Reload
id: portable-snapshots-configure
order: 11
description: "Wire portable snapshots so a later run rebuilds completed sandbox files from your persistence."
---

You have a sandbox chat. The agent writes files. The provider sandbox then goes
away. The next run starts empty.

Portable snapshots save those files after each successful terminal run. A later
run restores the latest checkpoint into a new private sandbox. By the end of
this page, `chat()` writes and restores those checkpoints.

Create one persistence value. Pass that exact value to `withPersistence` and to
the snapshots object. Put `withPersistence` before `withSandbox`.

## Start with the memory factory

Use `memorySandboxSnapshots` for local development. It creates persistence, a
checkpoint store, and the snapshot methods as one object. It does not load
`@tanstack/ai-persistence` at runtime.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withPersistence } from '@tanstack/ai-persistence'
import {
  defineSandbox,
  defineWorkspace,
  InMemorySandboxInstanceStore,
  memorySandboxSnapshots,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const instances = new InMemorySandboxInstanceStore()
const userId = 'user-123'

const sandbox = defineSandbox({
  id: 'app-builder',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({ source: { type: 'none' } }),
  lifecycle: { reuse: 'thread' },
})

const snapshots = await memorySandboxSnapshots({
  sandbox,
  instances,
})

const result = chat({
  threadId: 'app-thread',
  context: { userId },
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Create a landing page.' }],
  middleware: [
    withPersistence(snapshots.persistence),
    withSandbox(sandbox, {
      instances,
      snapshots,
    }),
  ],
})

void result
```

You can bind `sandbox`, `instances`, `tenant`, and `locks` at create time. A
later `snapshots.save` call can override those values. See
[Save a Named Version](./portable-snapshots-save).

Keep `instances` in the same server module as this middleware. A named save
must use this same instance store.

Pass the session `userId` in `context` for every run. Pass that same user id as
`tenant.userId` on `snapshots.save`.

## Add snapshots to existing persistence

If `withPersistence` already uses a persistence object, pass that same object
to `createSandboxSnapshots`. Do not create a second message store.

The persistence object must include `stores.messages`, `stores.artifacts`, and
`stores.blobs`.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withPersistence } from '@tanstack/ai-persistence'
import {
  createSandboxSnapshots,
  InMemorySandboxCheckpointStore,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { instances, persistence, sandbox } from './sandbox-server'

const snapshots = createSandboxSnapshots({
  persistence,
  checkpoints: new InMemorySandboxCheckpointStore(),
  sandbox,
  instances,
})

const result = chat({
  threadId: 'app-thread',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Create a landing page.' }],
  middleware: [
    withPersistence(snapshots.persistence),
    withSandbox(sandbox, {
      instances,
      snapshots,
    }),
  ],
})

void result
```

## Use durable stores in production

`memorySandboxSnapshots` is for local development and tests. Production needs
durable message, artifact, and blob stores, plus a durable checkpoint store.

The React chat example exports `sqliteSandboxSnapshots()` for a Node 22.5+
server. That function is an example adapter. It is not a package export.

Use one SQLite transaction for every checkpoint write, head update, and blob
reference count update. Use one transaction for a fork. The fork transaction
must also copy the source conversation. It must reject a destination thread
that already has persisted state.

## Writer leases

Each thread has one checkpoint writer lease.

- A second run for the same thread gets a writer conflict while the lease is
  active.
- The middleware renews the lease while the run is active.
- Pause and detach paths release the lease. They do not publish a partial
  checkpoint.
- If the writer loses the lease, the middleware does not publish the
  checkpoint. A later successful run can create a new checkpoint.

## What happens on the next run

A later run restores the latest checkpoint only into a new private sandbox. A
live resumed sandbox keeps its current files. See
[Portable Sandbox Snapshots](./portable-snapshots) for that restore rule.

Instance durability finds a provider sandbox across server processes. When that
sandbox is gone, portable snapshots rebuild the workspace. See
[Instance Durability](./durability).

The default policy excludes `.git`, `node_modules`, and `.env*` paths. Read
[What a Snapshot Stores](./portable-snapshots-safety) before you replace that
policy.
