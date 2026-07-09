---
title: Sandbox Persistence
id: sandbox-persistence
---

Use sandbox persistence when a coding-agent harness needs to resume the same
sandbox across processes, restore workspace files, or coordinate work across
workers. Add `withChatPersistence(...)` before `withSandbox(...)`; the sandbox
middleware reads optional persistence capabilities directly.

By the end, your sandbox run has durable records, optional locks, and optional
workspace checkpoints backed by the same persistence stores as chat.

## Install

Install the sandbox package, persistence package, and the persistence backend
you already use for durable chat runs:

```sh
pnpm add @tanstack/ai-sandbox @tanstack/ai-persistence @tanstack/ai-persistence-drizzle
```

## Persist sandbox identity

Sandbox identity persistence answers "which sandbox should this run use?" It
stores a sandbox record keyed by thread, sandbox id, provider, workspace, and
tenant.

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import type { ModelMessage } from '@tanstack/ai'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/state.sqlite',
  migrate: true,
})

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
  middleware: [withChatPersistence(persistence), withSandbox(repoSandbox)],
})
```

`withSandbox(...)` prefers an explicit sandbox store capability when one is
provided. Otherwise, when `withChatPersistence(...)` is earlier in the middleware
array and its backend exposes `stores.metadata`, sandbox records are stored in
persistence metadata. If the backend exposes `stores.locks`,
`withChatPersistence(...)` also provides the shared lock capability that sandbox
ensure uses to serialize resume/create work.

## Add locks for multi-worker resume

Sandbox resume needs two shared pieces of state:

- a sandbox record keyed by thread, sandbox id, provider, workspace, and tenant
- a lock for the same key so two workers do not create competing sandboxes

Without a durable lock, two workers may try to ensure the same sandbox at the
same time. Without persistence metadata, resume only works inside the process
that still has the in-memory sandbox record.

The batteries-included backends ship an in-memory lock (dev default). For
multi-worker deployments, provide a distributed lock store — a Durable Object
lock on Cloudflare (see [Cloudflare persistence](./cloudflare)), or another
backend-specific lock on Node — when more than one process can resume the same
sandbox key.

## Persist workspace files

Workspace persistence answers "which files should be restored if the sandbox
filesystem is gone?" It uses `stores.metadata` for the workspace manifest,
`stores.artifacts` for file records, `stores.blobs` for file bytes, and usually
`stores.locks` for multi-worker updates.

```ts ignore
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { drizzlePersistence } from '@tanstack/ai-persistence-drizzle'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { drizzle } from 'drizzle-orm/d1'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { cloudflareSandbox, type Sandbox } from '@tanstack/ai-sandbox-cloudflare'

interface Env {
  AI_D1: D1Database
  Sandbox: DurableObjectNamespace<Sandbox>
}

export function runProjectBuilder(env: Env) {
  // D1 is SQLite-compatible, so the Drizzle D1 adapter satisfies the state
  // store contract. Run migrations from the exported schema via drizzle-kit.
  const persistence = drizzlePersistence(drizzle(env.AI_D1))

  const projectSandbox = defineSandbox({
    id: 'project-builder',
    provider: cloudflareSandbox({ binding: env.Sandbox }),
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

  return chat({
    threadId: 'thread-123',
    runId: 'run-123',
    adapter: claudeCodeText('claude-sonnet-4-6'),
    messages: [{ role: 'user', content: 'Build the app.' }],
    middleware: [
      withChatPersistence(persistence, {
        features: ['messages', 'metadata', 'artifacts', 'blobs', 'locks'],
      }),
      withSandbox(projectSandbox),
    ],
  })
}
```

When a watched file changes, `withSandbox(...)` reads exact bytes from the
sandbox filesystem, saves them as artifacts, and updates a workspace manifest in
metadata. On the next run, it restores the manifest before `hooks.onReady` runs.

## Choose workspace options

Set `persistence.workspace` to `true` for defaults, or pass an object for
project-specific control.

| Option | Default | Purpose |
| --- | --- | --- |
| `key` | sandbox instance key | Stable project/workspace identity. |
| `root` | `workspace.root` or `/workspace` | Files under this root are restored and checkpointed. |
| `include` | all files under `root` | Optional allow-list of glob-like patterns. |
| `exclude` | `node_modules`, `.git`, `dist`, `build`, `.cache`, `.env*` | Extra patterns to skip. |
| `maxFileBytes` | `10 * 1024 * 1024` | Per-file safety limit. |
| `consistency` | `'strict'` | `'strict'` fails the run on persistence errors; `'best-effort'` swallows checkpoint and restore failures. |

Set workspace persistence to `false` or omit it when the provider already owns
durable filesystem state and you do not want TanStack AI to copy workspace
files.

## Understand the boundaries

Persistence replay and sandbox resume are separate pieces that work together.
`withChatPersistence(...)` replays the public event tail for the chat client. The
sandbox record lets `withSandbox(...)` find the same provider sandbox. A harness
adapter that supports reattach can then reconnect to the still-running agent
process and continue live after replay.

Workspace persistence is a checkpointing layer, not a source-control system. It
stores the latest durable contents for matching files and delete tombstones for
removed files. If your app needs history, branching, conflict resolution, or
garbage collection policies, store additional project metadata and artifacts
under your own keys. For the sandbox record, workspace manifest, lock, and
artifact-store contracts behind this flow, see
[Persistence Internals](./internals).
