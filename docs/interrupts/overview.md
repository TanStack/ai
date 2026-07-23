---
title: Overview
id: interrupts-overview
order: 1
description: "Pause an agent run for a human or application decision, then continue it exactly where it stopped."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - human in the loop
  - tool approval
  - resolveInterrupt
---

# Interrupts

Most agent runs are fire and forget. The model calls tools, they run, you get an
answer back. But some steps shouldn't happen on their own: moving money,
deleting a project, sending an email. And sometimes the agent needs an answer
only the user can give before it can go on.

An interrupt is a pause. The run stops, hands you a decision to make, and then
picks up exactly where it left off once you answer.

## How it works

1. The server reaches a step that needs a decision and ends the run with an
   `interrupt` outcome instead of a final answer.
2. The client gives you the pending decisions as `interrupts`.
3. You resolve each one (approve, reject, submit a value, or cancel).
4. The client starts a fresh continuation run that carries your answers and
   continues the agent.

No database is required. The browser sends the full message history back on the
continuation request, so a stateless server can rebuild the paused step and keep
going.

## What pauses a run

Two kinds of interrupt show up in the `interrupts` array for you to resolve:

| `kind` | You get a pause when | Guide |
| --- | --- | --- |
| `tool-approval` | A tool is marked `needsApproval` and the model calls it | [Tool Approval](./tool-approval) |
| `generic` | Your app ends a run to ask the user something that isn't a tool | [Generic Interrupts](./generic) |

## Interrupts that aren't ours: `unbound`

An interrupt is a standard AG-UI object, and TanStack AI is not the only thing
that can put one on a stream. A workflow engine pausing for a durable approval,
or another agent framework sharing the same connection, emits the same envelope.

What makes a pause resumable *here* is a binding this library attaches to the
interrupt's metadata, under a key exported as `INTERRUPT_BINDING_METADATA_KEY`.
It records which run and generation the pause belongs to, so your answer can be
matched back to the paused step.

When an interrupt arrives without one, you get it with `kind: 'unbound'` and
`canResolve: false`, and there is no `resolveInterrupt` to call:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Move money between accounts',
  needsApproval: true,
  inputSchema: z.object({ recipient: z.string(), amount: z.number() }),
  outputSchema: z.object({ receiptId: z.string() }),
}).client()

export function Pauses() {
  const { interrupts } = useChat({
    threadId: 'thread-1',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  return (
    <>
      {interrupts.map((interrupt) => {
        // Someone else owns this pause: show it, but offer no way to answer it.
        if (interrupt.kind === 'unbound') {
          return (
            <p key={interrupt.id}>
              Paused elsewhere: {interrupt.message ?? interrupt.reason}
            </p>
          )
        }
        if (interrupt.kind === 'generic') {
          return (
            <button
              key={interrupt.id}
              onClick={() => interrupt.resolveInterrupt({ confirmed: true })}
            >
              {interrupt.message ?? interrupt.reason}
            </button>
          )
        }
        return (
          <button
            key={interrupt.id}
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve {interrupt.toolName}
          </button>
        )
      })}
    </>
  )
}
```

The library will not invent a binding to make these resolvable. Doing so would
render a form whose answer gets submitted against a run that has nothing pending
— failing only after the user has filled it in. `unbound` says plainly that the
pause belongs to something else, and unbound items never block you from
resolving the ones that are yours.

If you emit your own pauses and want them resumable here, attach the binding
with `withInterruptBinding` rather than writing the metadata key by hand:

```ts
import {
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  digestInterruptJson,
  withInterruptBinding,
} from '@tanstack/ai'

const responseSchema = {
  type: 'object',
  properties: { speed: { type: 'string' } },
  required: ['speed'],
}

const descriptor = withInterruptBinding(
  {
    id: 'shipping-1',
    reason: 'confirmation',
    message: 'Which shipping speed?',
    responseSchema,
  },
  {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'generic',
    interruptId: 'shipping-1',
    // The server checks the schema it hands out still matches the one it
    // validates against, so the hash is computed from the schema itself.
    responseSchemaHash: digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    ),
  },
)
```

`v` is the binding's wire version. Readers reject a version they don't
recognise instead of guessing at the fields, which is what keeps another
producer's binding from being mistaken for one of ours.

## What about client tools?

A tool with a `.client()` implementation runs in the browser on its own and
reports its own result. That is not a decision you make, so it never appears in
`interrupts`. See [Client Tools](../tools/client-tools).

The one time a tool pauses is when you mark it `needsApproval: true`. Then it
stops for a yes or no first, whether it runs on the server or in the browser:

| Tool | What you handle |
| --- | --- |
| Server tool | Nothing, unless `needsApproval` adds a `tool-approval` pause. It then runs on the server after you approve. |
| Client tool | Nothing, it runs in the browser automatically. With `needsApproval` it pauses for approval first, then runs in the browser. |

So approval is the only thing you resolve for either kind of tool, and both use
the same `tool-approval` interrupt.

## Where to go next

| You want to | Page |
| --- | --- |
| Approve or reject a single tool call | [Tool Approval](./tool-approval) |
| Resolve several pending decisions at once | [Multiple Interrupts](./multiple) |
| Ask the user something that isn't a tool | [Generic Interrupts](./generic) |
| Run a tool in the browser | [Client Tools](../tools/client-tools) |
| Move off the old `approval-requested` events | [Migration](./migration) |
