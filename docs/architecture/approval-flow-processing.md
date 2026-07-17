---
title: Approval Flow Processing Architecture
id: approval-flow-processing
description: "Internal architecture of TanStack AI tool approvals, interrupts, persistence, and typed client resume handling."
keywords:
  - tanstack ai
  - approval flow
  - interrupts
  - state machine
  - persistence
---

# Approval Flow Processing Architecture

Tool approval is an interrupt-and-resume protocol. A run that needs user input
ends with one canonical event:

```ts
{
  type: 'RUN_FINISHED',
  runId: 'run-1',
  threadId: 'thread-1',
  timestamp: Date.now(),
  outcome: {
    type: 'interrupt',
    interrupts: [
      {
        id: 'approval-1',
        reason: 'approval_required',
        metadata: { kind: 'approval' },
      },
    ],
  },
}
```

The canonical event stream is the only approval event stream. Server state
persistence stores the interrupt record; stream delivery replay (resumable
streams) is a separate transport concern.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Tool definition | Declares `needsApproval: true` for a sensitive operation. |
| Chat engine | Stops before tool execution and emits the interrupt outcome. |
| Chat persistence middleware | Creates pending interrupt records, marks the run interrupted, and snapshots messages. |
| Chat client | Exposes `pendingInterrupts`, preserves `resumeState`, and sends typed resume entries. |
| Application UI | Explains the operation and resolves or cancels each interrupt. |

## Server setup

Define the tool and add state persistence before handling requests:

```ts
// tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const deleteProject = toolDefinition({
  name: 'delete_project',
  description: 'Delete a project permanently',
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
  needsApproval: true,
}).server(async ({ projectId }) => {
  await deleteProjectFromDatabase(projectId)
  return { deleted: true }
})

declare function deleteProjectFromDatabase(projectId: string): Promise<void>
```

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { withChatPersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'
import { deleteProject } from './tools'

const persistence = sqlitePersistence({
  url: 'file:.tanstack-ai/state.sqlite',
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
    tools: [deleteProject],
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

There is no feature flag. Middleware behavior follows the stores present on the
`AIPersistence` object. `interrupts` requires `runs`; invalid store
combinations fail at compile time when statically known and at runtime for
untyped JavaScript.

## Client state machine

A single approval follows this sequence:

1. The model emits a tool call.
2. The client tool-call part reaches `approval-requested`.
3. The run ends with `RUN_FINISHED.outcome.type === 'interrupt'`.
4. `useChat` exposes the descriptor in `pendingInterrupts` and retains
   `{ threadId, runId }` in `resumeState`.
5. The UI calls `resumeInterrupts(...)` with a resolution for every pending
   interrupt.
6. The next request carries those values in `RunAgentInput.resume`.
7. Persistence validates and resolves the stored records before the engine
   continues the tool call.

Normal input is rejected at step 4. This prevents a second branch from being
created while the existing run still waits for a decision.

## Real React approval UI

Use the values returned by `useChat`. Rendering the actual
`pendingInterrupts` array keeps ids and types connected to the hook that owns
the run.

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function ApprovalQueue() {
  const chat = useChat({
    id: 'project-chat',
    threadId: 'project-thread',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <section>
      {chat.pendingInterrupts.map((interrupt) => (
        <article key={interrupt.id}>
          <p>Approval required: {interrupt.reason}</p>
          <button
            onClick={() =>
              void chat.resumeInterrupts([
                {
                  interruptId: interrupt.id,
                  status: 'resolved',
                  payload: { approved: true },
                },
              ])
            }
          >
            Approve
          </button>
          <button
            onClick={() =>
              void chat.resumeInterrupts([
                { interruptId: interrupt.id, status: 'cancelled' },
              ])
            }
          >
            Deny
          </button>
        </article>
      ))}
    </section>
  )
}
```

For a batch, send one entry per pending interrupt in one call:

```tsx
import type { RunAgentResumeItem } from '@tanstack/ai/client'

function resolveInterrupt(
  interruptId: string,
  approved: boolean,
): RunAgentResumeItem {
  return approved
    ? {
        interruptId,
        status: 'resolved',
        payload: { approved: true },
      }
    : { interruptId, status: 'cancelled' }
}

function ResolveAll({ approved }: { approved: boolean }) {
  const chat = useChat({
    threadId: 'project-thread',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button
      onClick={() =>
        void chat.resumeInterrupts(
          chat.pendingInterrupts.map((interrupt) =>
            resolveInterrupt(interrupt.id, approved),
          ),
        )
      }
    >
      Resolve all
    </button>
  )
}
```

## Persistence and concurrency

`withChatPersistence` performs these state transitions:

| Run boundary | Run status | Other writes |
| --- | --- | --- |
| Start | `running` | Load and merge stored messages. |
| Interrupt outcome | `interrupted` | Create pending interrupts and save messages. |
| Successful finish | `completed` | Save messages and usage. |
| Provider/server error | `failed` | Save the error. |
| Abort | `interrupted` | Mark the run interrupted. |

When multiple workers can resume the same thread, provide a `locks` store.
Cloudflare Durable Objects can supply that store while D1 supplies messages,
runs, and interrupts. See [Cloudflare Persistence](../persistence/cloudflare).

## State durability versus stream delivery

Persisted interrupts survive page reloads and server restarts. They do not make
the live byte stream replayable — that is resumable streams, a separate
transport-level feature configured on the SSE response helper.
