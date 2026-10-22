---
title: Approval Flow Processing Architecture
id: approval-flow-processing
description: "How a TanStack AI tool approval pauses a run, how the client resumes it, and what the server checks before the tool runs."
keywords:
  - tanstack ai
  - approval flow
  - interrupts
  - state machine
  - persistence
---

This page lists each step from the model tool call to the tool result, after a person approves the call.

An approval is an interrupt. The run stops before the tool executes and ends with an `interrupt` outcome. The client sends the decision in a new run. The server checks that decision and then runs the tool.

For the public guide, see [Interrupts](../interrupts/overview). This page shows the internals.

## Set up an approval

1. Mark the tool with `needsApproval: true`:

```ts
// tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const projects = new Map([['demo', { name: 'Demo project' }]])

export const deleteProjectDefinition = toolDefinition({
  name: 'delete_project',
  description: 'Delete a project permanently',
  inputSchema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
  needsApproval: true,
})

export const deleteProject = deleteProjectDefinition.server(async ({ projectId }) => {
  return { deleted: projects.delete(projectId) }
})
```

2. Pass `parentRunId` and `resume` from the request to `chat()`:

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
    adapter: openaiText('gpt-6.1-sol'),
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

3. Render the pending interrupts from `useChat`:

```tsx group=approval-ui
import type { ItemInterruptError } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deleteProjectDefinition } from './tools'

export function ApprovalQueue() {
  const chat = useChat({
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

Ask the model to delete the `demo` project. The Approve button shows. Click it, and the tool runs.

This route needs no server storage. The browser sends the full message history back with the decision, and the engine rebuilds the paused call from it.

## How it works

One approval goes through these steps:

1. The model emits a tool call. On the client, the tool-call part reaches `approval-requested`.
2. The run ends with `RUN_FINISHED`, and `outcome.type` is `'interrupt'`.
3. `useChat` shows a bound item in `interrupts`. While an interrupt waits, `useChat` rejects normal input, so no second branch starts.
4. The UI calls `resolveInterrupt(...)` or `cancel()`. One item submits at once. A batch waits for a valid draft for each item.
5. The next request has a fresh `runId`, the interrupted `parentRunId`, and the exact AG-UI `resume` array.
6. The server checks the full set. Then the engine continues the tool call.

Each layer has one job:

| Layer | Job |
| --- | --- |
| Tool definition | Declares `needsApproval: true` for a sensitive operation. |
| Chat engine | Stops before the tool executes and emits the interrupt outcome. |
| Chat client | Binds descriptors to typed methods, stages drafts, and submits one exact resume batch. |
| Application UI | Explains the operation and calls `resolveInterrupt`, `cancel`, or the root batch controls. |
| Delivery adapter | Optional. Replays SSE events by opaque offsets that the adapter owns. |

## Advanced

### The interrupt terminal event

A run that needs user input ends with one canonical event:

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

This event stream is the only native approval event stream. It works without persistence.

- **With server state persistence**, the server stores the complete descriptor and binding batch before it exposes the terminal event.
- **With SSE delivery durability**, the adapter gives each delivered event an opaque resume offset. This is a separate layer.

If your code uses custom approval events, see [Migrate to AG-UI interrupts](../interrupts/migration).

### Descriptor to continuation pipeline

The rule is **descriptor, then validate all, then continuation, then history**:

1. The engine builds public descriptors and bindings. The output includes `MESSAGES_SNAPSHOT`, an optional `STATE_SNAPSHOT`, and the interrupt `RUN_FINISHED` terminal.
2. The client binds a descriptor only when it matches the tool registry of the client. The match covers reason, tool identity, call ID, schema hashes, interrupted run, and generation. An untrusted descriptor becomes `generic`. It does not get a typed tool resolver.
3. Item methods check and stage local drafts. The submit boundary holds each pending interrupt ID exactly once.
4. The client submits a fresh run with the full current message history, the interrupted `parentRunId`, and the complete resume batch.
5. The server checks **all** payloads, edited inputs, outputs, hashes, and correlation before it executes anything. It rebuilds the expected batch from the history that the client sent and from its current tool definitions.
6. Resumed tool calls emit results only. They do not replay synthetic tool-call start or argument events. The successful history belongs to the continuation run.

The server rebuilds the batch from history that the client sends. So ephemeral mode does not give replay, exactly-once, restart, or cross-instance guarantees. The server checks the message history, but it is still input from the client.

### Resolve a batch

When several interrupts wait, stage every resolution in one synchronous root callback:

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

### State durability and delivery durability

These are two different layers:

- **State.** Interrupts run ephemerally. The engine rebuilds the paused call from the message history that the browser sends on the continuation request. Durable recovery is an optional layer, and approvals do not need it.
- **Delivery.** Delivery durability makes the live byte stream replayable after a dropped connection. You configure it on `toServerSentEventsResponse`. It gives one opaque SSE id per chunk. It is not available for NDJSON. See [Resumable Streams](../resumable-streams/overview).
