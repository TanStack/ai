---
title: Portable Sandbox Snapshots
id: portable-snapshots
order: 10
description: "Store a completed sandbox workspace as durable files, artifacts, and conversation data, then rebuild it in a new sandbox."
---

An agent can finish work in a sandbox, then the sandbox can disappear. You can
need the same files when the page reloads or when a later run starts. Portable
sandbox snapshots save the completed workspace in your persistence stores.

This feature saves a checkpoint after each successful terminal run. A later
run restores that checkpoint into a new private sandbox before application code
can use the sandbox. You can also save a named checkpoint and fork from one
selected checkpoint.

The snapshot helpers run on the server. Your client calls routes that you own.
Do not expose a checkpoint, thread, or artifact id as authorization.

## Configure snapshots

Create one persistence value and use that exact value in both middleware calls.
Put `withPersistence` before `withSandbox`.

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

const snapshots = await memorySandboxSnapshots()
const instances = new InMemorySandboxInstanceStore()
const userId = 'user-123' // Read this from the server session.

const sandbox = defineSandbox({
  id: 'app-builder',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({ source: { type: 'none' } }),
  lifecycle: { reuse: 'thread' },
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
      snapshots: {
        persistence: snapshots.persistence,
        checkpoints: snapshots.checkpoints,
      },
    }),
  ],
})

void result
```

`memorySandboxSnapshots()` creates an in-memory persistence object directly. It
does not load `@tanstack/ai-persistence` at runtime.

Keep `instances` in the same server module as this middleware. A named save
must use this same store. Pass the session `userId` in `context` for every run.
Pass that same user id as `tenant.userId` to `saveNamedSandboxSnapshot`.

Use a durable persistence implementation and checkpoint store in production.
The memory factory is useful for local development and examples only.

The optional `policy` controls which workspace paths become files in a
checkpoint. See [Snapshot safety](#snapshot-safety) before you replace the
default policy.

## Save a named checkpoint

Automatic saves protect each completed run. Use a named save when a user marks
one workspace state, such as a release candidate. The helper requires a live,
reusable sandbox for the thread. A lifecycle with `reuse: 'none'` cannot create
a named checkpoint.

Keep this route on the server. Derive the owner from the session. Then make sure
that the owner can access the thread before you call the helper.

```ts
import { saveNamedSandboxSnapshot } from '@tanstack/ai-sandbox'
import { sandbox, snapshots, instances } from './sandbox-server'

export async function POST(request: Request) {
  const session = await requireSession(request)
  const { threadId, runId, label } = await request.json()

  if (
    typeof threadId !== 'string' ||
    typeof runId !== 'string' ||
    typeof label !== 'string'
  ) {
    return new Response('Invalid request', { status: 400 })
  }
  if (!(await session.canAccessThread(threadId))) {
    return new Response('Not found', { status: 404 })
  }

  const checkpoint = await saveNamedSandboxSnapshot({
    definition: sandbox,
    threadId,
    runId,
    instances,
    snapshots,
    label,
    tenant: { userId: session.userId },
  })
  return Response.json({ checkpointId: checkpoint.id, label: checkpoint.label })
}
```

The client sends its request to this route. It does not call the helper or use
the persistence stores directly.

```ts
export async function saveCheckpoint(
  threadId: string,
  runId: string,
  label: string,
) {
  const response = await fetch('/api/snapshots/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId, runId, label }),
  })
  if (!response.ok) throw new Error('Could not save checkpoint')
  return response.json()
}
```

## Fork from a selected checkpoint

Forking copies the selected checkpoint into an empty destination thread. It does
not fork from the latest checkpoint unless you pass that checkpoint id. The
source thread and its messages remain unchanged.

Your checkpoint store must implement `forkFromCheckpoint`. The operation must
atomically copy the selected checkpoint, the conversation, the head, and blob
reference counts. It must reject a non-empty destination thread.

```ts
import { forkFromSandboxSnapshot } from '@tanstack/ai-sandbox'
import { snapshots } from './sandbox-server'

export async function POST(request: Request) {
  const session = await requireSession(request)
  const { sourceThreadId, sourceCheckpointId, destinationThreadId } =
    await request.json()

  if (
    typeof sourceThreadId !== 'string' ||
    typeof sourceCheckpointId !== 'string' ||
    typeof destinationThreadId !== 'string'
  ) {
    return new Response('Invalid request', { status: 400 })
  }
  if (!(await session.canAccessThread(sourceThreadId))) {
    return new Response('Not found', { status: 404 })
  }
  if (!(await session.canCreateThread(destinationThreadId))) {
    return new Response('Not found', { status: 404 })
  }

  const checkpoint = await forkFromSandboxSnapshot({
    sourceThreadId,
    sourceCheckpointId,
    destinationThreadId,
    snapshots,
  })

  return Response.json({ checkpointId: checkpoint.id })
}
```

Use the same server authorization boundary for both source and destination
threads. Do not accept a client-selected checkpoint as proof of access.

```ts
export async function forkCheckpoint(
  sourceThreadId: string,
  sourceCheckpointId: string,
  destinationThreadId: string,
) {
  const response = await fetch('/api/snapshots/fork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sourceThreadId,
      sourceCheckpointId,
      destinationThreadId,
    }),
  })
  if (!response.ok) throw new Error('Could not fork checkpoint')
  return response.json()
}
```

## Read a snapshot artifact

`resolveSnapshotArtifact` reads copied artifact bytes from one checkpoint. It
checks that the checkpoint belongs to the supplied thread. Your route must still
authorize that thread before it calls the helper. The helper returns metadata
and `Uint8Array` bytes. It does not create an HTTP response.

```ts
import { resolveSnapshotArtifact } from '@tanstack/ai-sandbox'
import { snapshots } from './sandbox-server'

export async function GET(request: Request) {
  const session = await requireSession(request)
  const url = new URL(request.url)
  const threadId = url.searchParams.get('threadId')
  const checkpointId = url.searchParams.get('checkpointId')
  const artifactId = url.searchParams.get('artifactId')

  if (!threadId || !checkpointId || !artifactId) {
    return new Response('Not found', { status: 404 })
  }
  if (!(await session.canAccessThread(threadId))) {
    return new Response('Not found', { status: 404 })
  }

  const { artifact, bytes } = await resolveSnapshotArtifact({
    threadId,
    checkpointId,
    artifactId,
    snapshots,
  })
  return new Response(bytes, {
    headers: {
      'content-type': artifact.mimeType,
      'content-length': String(artifact.size),
    },
  })
}
```

The client can use the authorized route as an artifact URL. It must not read the
blob store or call `resolveSnapshotArtifact` in the browser.

```ts
export function snapshotArtifactUrl(
  threadId: string,
  checkpointId: string,
  artifactId: string,
) {
  const query = new URLSearchParams({ threadId, checkpointId, artifactId })
  return `/api/snapshots/artifact?${query}`
}
```

## What completes and restores

After a successful terminal run, the middleware waits for persistence to save
the conversation. It then creates one immutable checkpoint for the thread.

The checkpoint contains:

- Regular workspace files.
- Empty directories.
- Generated artifacts that already belong to the thread.
- The saved conversation for the thread.

File data and copied artifact data use separate content-addressed blob
namespaces. Equal file data deduplicates with file data. Equal artifact data
deduplicates with artifact data. The system does not delete unused blobs
automatically yet.

On a later run, the middleware uses the latest checkpoint only when it has a
new private sandbox. It restores the files after bootstrap and before the
sandbox is exposed to hooks or the harness.

A live resumed sandbox is never overwritten. Provider-native snapshots can
make bootstrap faster. Portable checkpoints rebuild the durable workspace when
there is no live sandbox to resume. See [Lifecycle & Snapshots](./lifecycle)
for provider-native snapshot behavior.

Portable snapshots do not restore into a live sandbox. The next private sandbox
gets the latest checkpoint after bootstrap. A named checkpoint remains available
for reading or for a selected fork. It does not change automatic restore.

The conversation comes from the durable message store, not from the sandbox
journal. The journal remains a run-output log. See [The Run Journal](./journal)
when you need to replay agent output.

## Snapshot safety

Portable snapshots support regular files and directories only. A capture or
restore fails safely when it finds a symlink, an executable file, or a special
filesystem entry.

The default policy excludes these paths at every depth:

- `.git`
- `node_modules`
- `.env*`
- The workspace projection marker, `.tanstack-projected-<workspaceHash>`

Resolved secret values are replaced with zero bytes before their content is
hashed or stored. A custom policy cannot capture or restore the exact projection
marker for the workspace.

An invalid manifest, a missing blob, or changed blob content stops the restore
before it writes the workspace. The failed private sandbox is then discarded.
Your existing resumed sandbox remains unchanged.

## Durable SQLite store

`memorySandboxSnapshots()` is for tests and local examples. A production store
needs durable message, artifact, and blob stores, plus a durable checkpoint
store. The SQLite example exports `sqliteSandboxSnapshots()` for a Node 22.5+
server. It is an example adapter, not a package export.

Use one SQLite transaction for every checkpoint write, head update, and blob
reference count update. Use one transaction for a fork. The fork transaction
must also copy the source conversation and reject a destination thread that has
any persisted state. A partial transaction can create a checkpoint that points
to missing data or a wrong blob reference count.

## Test route

`testing/e2e/src/routes/api.sandbox-file-persistence.ts` is a test-only route.
It uses in-memory stores and a fake provider. Do not copy this route into an
application. Use your authenticated server routes and durable stores instead.

## Operations

Each thread has one checkpoint writer lease. A second run for the same thread
gets a writer conflict while the existing lease is active. The middleware
renews its lease while the run is active.

Pause and detach paths release the lease. They do not publish a partial
checkpoint. If the writer loses its lease, the middleware does not publish the
checkpoint. A later successful run can create a new checkpoint.

Portable snapshots work with [Instance Durability](./durability). Instance
durability finds a provider sandbox across server processes. Portable snapshots
rebuild the workspace when that sandbox is unavailable.

See [Providers](./providers) for provider-native snapshot and resume support.
