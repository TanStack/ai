---
title: Sandbox Persistence
id: sandbox-persistence
---

# Sandbox Persistence

Sandbox persistence covers two kinds of state:

- sandbox instance metadata used to resume a provider sandbox;
- optional workspace checkpoints used to restore changed files.

`withSandbox` reads persistence supplied by an earlier
`withChatPersistence(...)` middleware.

## Configure workspace checkpoints

```ts
import {
  defineSandbox,
  defineWorkspace,
  localSource,
} from '@tanstack/ai-sandbox'
import type { SandboxProvider } from '@tanstack/ai-sandbox'

declare const provider: SandboxProvider

export const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider,
  workspace: defineWorkspace({
    source: localSource('.'),
    root: '/workspace',
  }),
  persistence: {
    workspace: {
      include: ['src/**', 'package.json'],
      exclude: ['.env*'],
      maxFileBytes: 10 * 1024 * 1024,
      consistency: 'strict',
    },
  },
})
```

Workspace persistence requires `metadata`, `artifacts` with `delete()`, and
`blobs`. A
`locks` store is optional but recommended when multiple workers can checkpoint
the same workspace key.

The metadata store holds a manifest. Each file has an `ArtifactRecord`; its
bytes live in `BlobStore`. `ArtifactRecord` itself has no byte field.

## Add persistence before sandbox middleware

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './repo-sandbox'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/sandbox.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.resume ? { resume: params.resume } : {}),
    middleware: [
      withChatPersistence(persistence),
      withSandbox(repoSandbox),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

The React client remains a normal chat client:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function CodingChat() {
  const chat = useChat({
    threadId: 'coding-thread',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button onClick={() => void chat.sendMessage('Update the README')}>
      Run
    </button>
  )
}
```

## Checkpoint behavior

When workspace persistence is enabled:

1. the sandbox is ensured;
2. the stored manifest is loaded and files/deletions are restored;
3. file events update blob bytes, artifact metadata, and the manifest;
4. pending checkpoint writes are drained before finish, abort, or error.

Default exclusions include `node_modules`, `.git`, build output, caches, and
`.env*`. Paths outside the configured root and traversal paths are rejected.

`consistency: 'strict'` surfaces checkpoint failures and can fail the run.
`'best-effort'` keeps the sandbox run alive when checkpoint storage fails. Pick
this explicitly based on whether a recoverable workspace is part of the
product contract.

## Cloudflare stores

Cloudflare can back all workspace checkpoint stores:

```ts
/// <reference types="@cloudflare/workers-types" />

import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

declare const env: {
  AI_STATE: D1Database
  AI_MEDIA: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

const persistence = cloudflarePersistence({
  d1: env.AI_STATE,
  r2: env.AI_MEDIA,
  durableObjects: env.AI_LOCKS,
})
```

D1 stores manifests and sandbox metadata, R2 stores artifact/blob data, and
Durable Objects coordinate checkpoint writes. Override individual stores with
`composePersistence(base, { overrides })` when part of the state belongs in an
application database.

## Delivery is not workspace persistence

Workspace checkpointing does not make chat output replayable. Add SSE delivery
durability separately if clients must reconnect to an in-flight run. Sandbox
file events remain canonical stream chunks; persistence does not create a
second event stream.
