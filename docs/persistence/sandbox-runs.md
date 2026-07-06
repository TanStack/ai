---
title: Sandbox Runs
id: sandbox-runs
---

Use sandbox persistence when a coding-agent harness needs to resume the same
sandbox across processes, not just within one Node.js process. Add
`withPersistence(...)` before `withSandbox(...)`; the sandbox middleware reads
optional persistence capabilities directly.

## Install

Install the sandbox package, persistence package, and the persistence backend
you already use for durable chat runs:

```sh
pnpm add @tanstack/ai-sandbox @tanstack/ai-persistence @tanstack/ai-persistence-sqlite
```

## Compose persistence and sandbox directly

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-sqlite'
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import type { ModelMessage } from '@tanstack/ai'

const persistence = sqlitePersistence({ path: '.tanstack-ai/state.sqlite' })

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
  middleware: [withPersistence(persistence), withSandbox(repoSandbox)],
})
```

`withSandbox(...)` prefers an explicit `SandboxStoreCapability` when one is
provided. Otherwise, when `withPersistence(...)` is earlier in the middleware
array and its backend exposes `stores.metadata`, sandbox records are stored in
persistence metadata. If the backend exposes `stores.locks`, `withPersistence`
also provides the shared lock capability that sandbox ensure uses to serialize
resume/create work.

## Locks and records

Sandbox resume needs two pieces of shared state:

- a sandbox record keyed by thread, sandbox id, provider, workspace, and tenant
- a lock for the same key so two workers do not create competing sandboxes

Persistence metadata stores the sandbox record. Persistence locks, when the
backend provides them, make ensure/resume safe across processes. On Cloudflare,
that usually means Durable Object locks. On Node, use a backend-specific lock
store when more than one process can resume the same sandbox key.

Without a durable lock, two workers may try to ensure the same sandbox at the
same time. Without persistence metadata, resume only works inside the process
that still has the in-memory sandbox record.

## Harness resume

Persistence replay and sandbox resume are separate pieces that work together.
`withPersistence` replays the public event tail for the chat client. The
sandbox record lets `withSandbox` find the same provider sandbox. A harness
adapter that supports reattach can then reconnect to the still-running agent
process and continue live after replay.
