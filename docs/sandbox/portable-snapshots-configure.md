---
title: Keep Files After Reload
id: portable-snapshots-configure
order: 11
description: "Wire portable snapshots so a later run rebuilds completed sandbox files from your persistence."
---

Configure portable snapshots on a sandbox chat. The next run restores the files the agent wrote after the provider sandbox is gone.

Portable snapshots save those files after each successful run, and restore the latest checkpoint into a new private sandbox.

The rules for every setup:

1. Create one persistence value.
2. Pass that same value to `withPersistence` and to the snapshots object.
3. Put `withPersistence` before `withSandbox`.

This page is enough for automatic save and restore. Add these pages only when you need them:

- A named version: [Save a Named Version](./portable-snapshots-save).
- A fork: [Branch From a Version](./portable-snapshots-fork).
- A download: [Send a Frozen File](./portable-snapshots-artifacts).
- A file policy: [Pick Which Files to Keep](./portable-snapshots-files).

## Create new persistence

Use `memorySandboxSnapshots` for local development. It creates persistence, a
checkpoint store, and the snapshot methods as one object. It does not load
`@tanstack/ai-persistence` at runtime.

Docker must be running, and `XAI_API_KEY` must be set.

```ts
import { chat } from '@tanstack/ai'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import { withPersistence } from '@tanstack/ai-persistence'
import {
  createSecrets,
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
  workspace: defineWorkspace({
    source: { type: 'none' },
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
  lifecycle: { reuse: 'thread' },
})

const snapshots = await memorySandboxSnapshots({
  sandbox,
  instances,
})

const result = chat({
  threadId: 'app-thread',
  context: { userId },
  adapter: grokBuildText('composer-2.5'),
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

## Reuse existing persistence

If `withPersistence` already uses a persistence object, pass that same object
to `createSandboxSnapshots`. Do not create a second message store.

The persistence object must include these stores:

- `messages`
- `artifacts` (with `listForThread`)
- `blobs`

You also need a checkpoint store. That store is not a persistence store.

If you already keep generated files, you already have `artifacts` and `blobs`.
Use those same stores.

If you only have `messages`, add `artifacts` and `blobs` to that same adapter.
See [Which stores do you need?](../persistence/build-your-own-adapter#which-stores-do-you-need)
and [Build a generation adapter](../persistence/build-your-own-generation-adapter).

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
  adapter: grokBuildText('composer-2.5'),
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

## What happens on the next run

A later run restores the latest checkpoint only into a new private sandbox. A
live resumed sandbox keeps its current files. See
[Portable Sandbox Snapshots](./portable-snapshots) for that restore rule.

Instance durability finds a provider sandbox across server processes. When that
sandbox is gone, portable snapshots rebuild the workspace. See
[Instance Durability](./durability).

The default policy excludes `.git`, `node_modules`, and `.env*` paths. To keep
only some files, or one file, see
[Pick Which Files to Keep](./portable-snapshots-files). Read
[What a Snapshot Stores](./portable-snapshots-safety) for secrets and restore
safety.

## Advanced

### Use durable stores in production

`memorySandboxSnapshots` is for local development and tests. Production needs
durable message, artifact, and blob stores, plus a durable checkpoint store.

The React chat example exports `sqliteSandboxSnapshots()` for a Node 22.5+
server. That function is an example adapter. It is not a package export.

Use one SQLite transaction for every checkpoint write, head update, and blob
reference count update. Use one transaction for a fork. The fork transaction
must also copy the source conversation. It must reject a destination thread
that already has persisted state.

### Writer leases

Each thread has one checkpoint writer lease.

- A second run for the same thread gets a writer conflict while the lease is
  active.
- The middleware renews the lease while the run is active.
- Pause and detach paths release the lease. They do not publish a partial
  checkpoint.
- If the writer loses the lease, the middleware does not publish the
  checkpoint. A later successful run can create a new checkpoint.
