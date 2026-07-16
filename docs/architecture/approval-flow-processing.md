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
const interruptTerminal = {
  type: 'RUN_FINISHED',
  runId: 'run-1',
  threadId: 'thread-1',
  timestamp: Date.now(),
  outcome: {
    type: 'interrupt',
    interrupts: [
      {
        id: 'approval-1',
        reason: 'tool_call',
        toolCallId: 'call-1',
        responseSchema: {
          oneOf: [
            { type: 'object', properties: { approved: { const: true } } },
            { type: 'object', properties: { approved: { const: false } } },
          ],
        },
      },
    ],
  },
}
```

The canonical event stream is the only native approval event stream. It works
ephemerally without persistence. When server state persistence is configured,
it stores the complete descriptor/binding batch before the terminal is exposed;
SSE delivery durability separately assigns opaque resume offsets to delivered
events. Native paths do not emit `approval-requested` or
`tool-input-available` custom events.

See [Interrupts](../interrupts/overview) for the public server/client guide and
[Migrate to AG-UI interrupts](../interrupts/migration) for deprecated readers.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Tool definition | Declares `needsApproval: true` for a sensitive operation. |
| Chat engine | Stops before tool execution and emits the interrupt outcome. |
| Chat persistence middleware | Optionally opens the descriptor/binding batch atomically, marks the run interrupted, and snapshots authoritative messages. |
| Chat client | Binds descriptors to typed methods, stages drafts, and submits one exact resume batch. |
| Application UI | Explains the operation and uses `resolveInterrupt`, `cancel`, or root batch controls. |
| Delivery adapter | Optionally replays SSE events by opaque adapter-owned offsets. |

## Descriptor to continuation pipeline

The base invariant is **descriptor → validate all → continuation → history**.
Durable mode inserts **open batch → compare-and-swap → receipt** around that
flow:

1. The engine builds public descriptors and bindings. Output includes
   `MESSAGES_SNAPSHOT`, optional `STATE_SNAPSHOT`, and the interrupt
   `RUN_FINISHED` terminal. When persistence is configured, it first opens the
   entire batch atomically and assigns its generation.
2. The client binds only descriptors whose reason, tool identity, call ID,
   schema hashes, interrupted run, and generation match its tool registry.
   Anything untrusted degrades to `generic` rather than gaining a typed tool
   resolver.
3. Item methods validate and stage local drafts. The submit boundary contains
   every pending interrupt ID exactly once.
4. The client submits a fresh run with the full current message history, the
   interrupted `parentRunId`, and the complete resume batch.
5. The server validates **all** payloads, edited inputs, outputs, hashes, and
   correlation before executing anything. Ephemeral mode reconstructs the
   expected batch from client-provided history and current tool definitions.
   Durable mode instead uses stored authoritative state and also validates
   expiry and generation.
6. Durable mode uses one transaction to compare the current interrupted run and
   generation, store the canonical resolution fingerprint, and record the
   continuation receipt. Ephemeral mode proceeds directly after validation.
7. Resumed tool calls emit results only; they do not replay synthetic tool-call
   start/argument events. Successful history belongs to the continuation run.

With persistence, an exact retry returns the recorded continuation and a stale
or different submission returns authoritative recovery state. Ephemeral mode
does not provide replay, exactly-once, restart, or cross-instance guarantees;
its message history is validated but remains client-provided input.

## Server setup

Define the tool normally. The following route opts into state persistence for
durable recovery and concurrency guarantees; omit the persistence imports,
store, and middleware for the zero-configuration ephemeral flow:

```ts
// tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const deleteProjectDefinition = toolDefinition({
  name: 'delete_project',
  description: 'Delete a project permanently',
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
  needsApproval: true,
})

export const deleteProject = deleteProjectDefinition.server(async ({ projectId }) => {
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
    parentRunId: params.parentRunId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [deleteProject],
    middleware: [withChatPersistence(persistence)],
  })

  return toServerSentEventsResponse(stream)
}
```

Persistence is not required to emit or resolve interrupts. When middleware is
present, behavior follows the stores on the `AIPersistence` object.
`interrupts` requires `runs` within that optional durable configuration;
invalid store combinations fail at compile time when statically known and at
runtime for untyped JavaScript.

## Client state machine

A single approval follows this sequence:

1. The model emits a tool call.
2. The client tool-call part reaches `approval-requested`.
3. The run ends with `RUN_FINISHED.outcome.type === 'interrupt'`.
4. `useChat` exposes a bound item in `interrupts`.
5. The UI calls `resolveInterrupt(...)` or `cancel()`; a singleton
   submits immediately, while a multi-item batch waits for every valid draft.
6. The next request carries a fresh `runId`, the interrupted `parentRunId`, and
   the exact AG-UI `resume` array.
7. The server validates the full set before the engine continues the tool call.
   With persistence, it also commits the set atomically against authoritative
   state.

Normal input is rejected at step 4. This prevents a second branch from being
created while the existing run still waits for a decision.

## React approval UI

Use the bound values returned by `useChat`. Rendering `interrupts` keeps IDs,
tool types, drafts, and errors connected to the hook that owns the run.

```tsx group=approval-ui
import type { ItemInterruptError } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deleteProjectDefinition } from './tools'

export function ApprovalQueue() {
  const chat = useChat({
    id: 'project-chat',
    threadId: 'project-thread',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [deleteProjectDefinition] as const,
  })

  return (
    <section>
      {chat.interrupts.map((interrupt) => (
        <article key={interrupt.id}>
          <p>Approval required: {interrupt.reason}</p>
          {interrupt.kind === 'tool-approval' ? (
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
          ) : null}
          <button onClick={() => interrupt.cancel()}>Cancel</button>
          {interrupt.errors.map((error: ItemInterruptError) => (
            <p key={`${error.code}:${error.path?.join('.') ?? ''}`}>
              {error.message}
            </p>
          ))}
        </article>
      ))}
    </section>
  )
}
```

For a batch, stage every resolution in one synchronous root callback:

```tsx group=approval-ui
function ResolveAll({ approved }: { approved: boolean }) {
  const chat = useChat({
    threadId: 'project-thread',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [deleteProjectDefinition] as const,
  })

  return (
    <button
      onClick={() =>
        void chat.resolveInterrupts((interrupt) => {
          if (interrupt.kind === 'tool-approval') {
            if (approved) {
              interrupt.resolveInterrupt(true)
            } else {
              interrupt.resolveInterrupt(false)
            }
            return
          }
          interrupt.cancel()
        })
      }
    >
      Resolve all
    </button>
  )
}
```

## Optional persistence and concurrency

When configured, `withChatPersistence` performs these state transitions:

| Run boundary | Run status | Other writes |
| --- | --- | --- |
| Start | `running` | Load and merge stored messages. |
| Interrupt outcome | `interrupted` | Atomically open the descriptor/binding batch and save messages before emission. |
| Accepted resume | `running` continuation | Validate all entries, CAS the generation/current run, store the receipt, and link the new run to its parent. |
| Successful finish | `completed` | Save messages and usage. |
| Provider/server error | `failed` | Save the error. |
| Abort | `interrupted` | Mark the run interrupted. |

Within durable mode, the interrupt store's compare-and-swap is required even
when a `locks` store is present. Locks reduce contention; they do not replace
idempotent receipts or database conflict detection. Cloudflare Durable Objects
can supply locks while D1 supplies messages, runs, and interrupts. See
[Cloudflare Persistence](../persistence/cloudflare) and
[Custom stores](../persistence/custom-stores).

## State durability versus delivery durability

Persisted interrupts survive page reloads and server restarts. They do not make
the live byte stream replayable. Delivery durability is configured on
`toServerSentEventsResponse` and assigns one opaque SSE id per chunk. It is not
available for NDJSON. See
[Delivery Durability](../persistence/delivery-durability).
