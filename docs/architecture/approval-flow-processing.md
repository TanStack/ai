---
title: Approval Flow Processing Architecture
id: approval-flow-processing
description: "Internal interrupt → validate → resume pipeline for tool approvals (ephemeral by default)."
keywords:
  - tanstack ai
  - approval flow
  - interrupts
  - state machine
  - persistence
---

# Approval Flow Processing Architecture

If a tool needs user input → the run ends with one interrupt terminal. Public guide: [Interrupts](../interrupts/overview). Deprecated readers: [Migrate to AG-UI interrupts](../interrupts/migration).

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

Canonical event stream only. Works ephemerally without persistence. With server state persistence, the descriptor/binding batch is stored before the terminal is exposed. Native paths do **not** emit `approval-requested` or `tool-input-available` custom events.

## Layer responsibilities

| Layer | Responsibility |
| --- | --- |
| Tool definition | `needsApproval: true` |
| Chat engine | Stop before execute; emit interrupt outcome |
| Chat client | Bind descriptors, stage drafts, submit one resume batch |
| Application UI | `resolveInterrupt` / `cancel` / root batch controls |
| Delivery adapter | Optional SSE replay by opaque offsets |

## Pipeline: descriptor → validate all → continuation → history

1. Engine builds descriptors/bindings → `MESSAGES_SNAPSHOT`, optional `STATE_SNAPSHOT`, interrupt `RUN_FINISHED`
2. Client binds only descriptors that match reason, tool identity, call ID, schema hashes, interrupted run, generation — untrusted → `generic`
3. Item methods validate and stage drafts; submit includes every pending interrupt ID exactly once
4. Client starts a fresh run with full message history, interrupted `parentRunId`, full resume batch
5. Server validates **all** payloads, edits, hashes, correlation; rebuilds expected batch from client history + current tool defs
6. Resumed tools emit results only (no synthetic tool-call start/args replay)

Ephemeral mode: no replay / exactly-once / restart / cross-instance guarantees — history is client-provided and validated.

## Server setup (ephemeral)

No storage required. Continuation rebuilds the paused call from browser-sent history.

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
import { deleteProject } from './tools'

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
  })

  return toServerSentEventsResponse(stream)
}
```

## Client state machine

1. Model emits tool call
2. Tool-call part → `approval-requested`
3. Run ends: `RUN_FINISHED.outcome.type === 'interrupt'`
4. `useChat` exposes bound item in `interrupts`
5. UI: `resolveInterrupt(...)` or `cancel()` — singleton submits immediately; multi-item batch waits for every valid draft
6. Next request: fresh `runId`, interrupted `parentRunId`, exact AG-UI `resume` array
7. Server validates full set, then continues

Normal input is rejected at step 4 while a decision is pending.

## React approval UI

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

Batch — stage every resolution in one synchronous root callback:

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

## State durability vs delivery durability

| Kind | What it does |
| --- | --- |
| State (ephemeral default) | Rebuild paused call from message history on continue |
| Delivery | Replay live byte stream after drop — configure on `toServerSentEventsResponse` (opaque SSE id per chunk; not NDJSON) |

See [Resumable Streams](../resumable-streams/overview).
