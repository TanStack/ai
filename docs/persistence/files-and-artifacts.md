---
title: Files and Artifacts
id: files-and-artifacts
---

Use file persistence when a run creates durable outputs: generated documents,
images, logs, downloads, or sandbox workspace files. Chat replay stores the
AG-UI stream; artifacts and blobs store bytes that should survive beyond the
stream itself.

You need a persistence backend with:

- `stores.metadata` for manifests and app-owned pointers,
- `stores.artifacts` for named outputs tied to a run and thread,
- `stores.blobs` when your backend separates raw object bytes from artifact
  metadata,
- `stores.locks` when multiple server instances can update the same file set.

If you pass a manual `features` list to `withPersistence(...)`, include
`metadata`, `artifacts`, and usually `locks` for file-heavy scenarios. Include
`blobs` when your app writes directly to the blob store instead of only using
artifact APIs.

## Save a generated file

Use `stores.artifacts` when a run produces a file the user may download, preview,
or reopen later.

```ts
import { chat } from '@tanstack/ai'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'

const persistence = sqlitePersistence({ path: '.tanstack-ai/state.sqlite' })

async function saveReport(input: {
  threadId: string
  runId: string
  markdown: string
}) {
  const bytes = new TextEncoder().encode(input.markdown)

  await persistence.stores.artifacts?.save({
    artifactId: `report:${input.runId}`,
    runId: input.runId,
    threadId: input.threadId,
    name: 'report.md',
    mimeType: 'text/markdown',
    size: bytes.byteLength,
    bytes,
    createdAt: Date.now(),
  })
}

chat({
  threadId: 'thread-123',
  runId: 'run-123',
  messages: [{ role: 'user', content: 'Write the report.' }],
  middleware: [
    withPersistence(persistence, {
      features: ['messages', 'durable-replay', 'artifacts'],
    }),
  ],
})
```

`list(runId)` returns artifact metadata for a run. `get(artifactId)` returns the
metadata and hydrates `bytes` when the backend has the byte body available.

```ts
const artifacts = await persistence.stores.artifacts?.list('run-123')
const report = await persistence.stores.artifacts?.get('report:run-123')

if (report?.bytes) {
  const markdown = new TextDecoder().decode(report.bytes)
  console.log(markdown)
}
```

## Store raw blobs

Use `stores.blobs` for app-owned objects that are not themselves run artifacts:
project archives, cache entries, screenshots, or large files referenced from
metadata.

```ts
await persistence.stores.blobs?.put(
  'projects/project-123/archive.zip',
  zipBytes,
  {
    contentType: 'application/zip',
    customMetadata: {
      projectId: 'project-123',
    },
  },
)

await persistence.stores.metadata?.set(
  'project:project-123',
  'latest-archive',
  { blobKey: 'projects/project-123/archive.zip' },
)
```

Artifacts are the better default when the file belongs to a chat run. Blobs are
the lower-level primitive when your app owns the index shape.

## Persist sandbox workspace files

Sandbox workspace persistence keeps project files durable across refreshes,
Worker restarts, container eviction, or providers whose filesystem is not
durable. Add `withPersistence(...)` before `withSandbox(...)`, then opt the
sandbox into managed workspace persistence.

Workspace persistence is separate from sandbox run persistence. Use
[Sandbox Runs](./sandbox-runs) when you need durable sandbox records and locks
for resume-by-id. Use this page when the workspace files themselves are the
durable product.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const persistence = sqlitePersistence({ path: '.tanstack-ai/state.sqlite' })

const projectSandbox = defineSandbox({
  id: 'project-builder',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'none' },
    root: '/workspace',
  }),
  lifecycle: {
    reuse: 'thread',
    destroyOnComplete: false,
  },
  persistence: {
    workspace: {
      key: 'project-123',
      root: '/workspace',
      exclude: ['**/.turbo/**', '**/coverage/**'],
      maxFileBytes: 10 * 1024 * 1024,
      consistency: 'strict',
    },
  },
})

const stream = chat({
  threadId: 'thread-123',
  runId: 'run-123',
  adapter: claudeCodeText('claude-sonnet-4-6'),
  messages: [{ role: 'user', content: 'Build the app.' }],
  middleware: [
    withPersistence(persistence, {
      features: [
        'messages',
        'durable-replay',
        'metadata',
        'artifacts',
        'locks',
      ],
    }),
    withSandbox(projectSandbox),
  ],
})
```

When a watched file changes, `withSandbox(...)` reads exact bytes from the
sandbox filesystem, saves them as artifacts, and updates a workspace manifest in
metadata. On the next run, it restores the manifest before `hooks.onReady` runs.

Set `persistence.workspace` to `true` for defaults:

```ts
const projectSandbox = defineSandbox({
  id: 'project-builder',
  provider,
  workspace,
  persistence: {
    workspace: true,
  },
})
```

Set it to `false` or omit it when the provider already owns durable filesystem
state and you do not want TanStack AI to copy workspace files.

```ts
const projectSandbox = defineSandbox({
  id: 'project-builder',
  provider,
  workspace,
  persistence: {
    workspace: false,
  },
})
```

## Workspace options

| Option | Default | Purpose |
| --- | --- | --- |
| `key` | sandbox instance key | Stable project/workspace identity. Use your project id when multiple threads can edit the same project. |
| `root` | `workspace.root` or `/workspace` | Files under this root are restored and checkpointed. |
| `include` | all files under `root` | Optional allow-list of glob-like patterns. |
| `exclude` | `node_modules`, `.git`, `dist`, `build`, `.cache`, `.env*` | Extra patterns to skip. Defaults are always applied. |
| `maxFileBytes` | `10 * 1024 * 1024` | Per-file safety limit. |
| `consistency` | `'strict'` | `'strict'` fails the run on persistence errors; `'best-effort'` swallows checkpoint and restore failures. |

`fileEvents: false` only disables public `sandbox.file` stream events and
server-side file hooks. Managed workspace persistence still watches the
configured root so durability does not depend on UI observability.

## Cloudflare layout

On Cloudflare, D1, R2, and Durable Objects map directly to the stores workspace
persistence uses:

- D1 stores run state, metadata, and artifact index rows,
- R2 stores artifact bytes,
- Durable Objects provide cross-isolate locks.

```ts
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

interface Env {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

export function persistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_D1,
    r2: env.AI_BLOBS,
    durableObjects: env.AI_LOCKS,
  })
}
```

For a Lovable-style builder, this means chat events and pending interrupts
resume from D1, project file bytes live in R2, and the manifest in D1 points each
workspace path at its latest artifact. If the sandbox container disappears,
`withSandbox(...)` creates or resumes the provider sandbox and restores the
workspace from that manifest before the next harness run starts.

For Worker binding setup, lazy migrations, and Durable Object lock wiring, see
[Cloudflare](./cloudflare).

## What this does not do

Workspace persistence is a checkpointing layer, not a source-control system.
It stores the latest durable contents for matching files and delete tombstones
for removed files. If your app needs history, branching, conflict resolution, or
garbage collection policies, store additional project metadata and artifacts
under your own keys.

Chat replay is also separate from file persistence. Use
[Resumable Chat](./resumable-chat) for stream resume, then add this page's
artifact or workspace persistence when the run creates durable files.

If you implement your own backend, [Custom Stores](./custom-stores) defines the
metadata, artifact, blob, and lock store contracts this page relies on.
