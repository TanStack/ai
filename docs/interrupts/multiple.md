---
title: Multiple Interrupts
id: interrupts-multiple
order: 3
description: "Render a queue of pending decisions and resolve them item by item or all at once as one atomic batch."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - resolveInterrupts
  - batch approval
  - cancelInterrupts
---

# Multiple Interrupts

One run can pause on several decisions at once. The model lines up three
transfers, or an approval and a question land together. You want to show the
whole queue and send the answers back together, not one round trip each.

## Two ways to resolve

You have already seen the first one on the [Tool Approval](./tool-approval) page:
call a method on the item itself.

```ts ignore
// Per item: resolve each one where you render it.
interrupt.resolveInterrupt(true)
```

When several are pending, it is often easier to answer them all from one place.
The `useChat` hook gives you root helpers that act on the whole queue:

```ts ignore
// All at once: one callback decides every pending item.
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true)
    return
  }
  interrupt.cancel()
})
```

Both stage local drafts. Nothing goes to the server until every pending item has
an answer, then the whole set submits at once. The server accepts all of them or
none, so you never end up with half a batch applied.

## Render the queue

Map over `interrupts` and switch on `kind`. Each item carries its own
`canResolve` and `errors`:

```tsx
// app/decision-queue.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { transferTool } from '../tools/transfer'

export function DecisionQueue() {
  const { interrupts, resolveInterrupts, cancelInterrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  if (interrupts.length === 0) return null

  return (
    <section>
      <p>{interrupts.length} decision(s) needed</p>

      {interrupts.map((interrupt) => {
        if (
          interrupt.kind === 'tool-approval' &&
          interrupt.toolName === 'transfer'
        ) {
          return (
            <article key={interrupt.id}>
              <p>
                {interrupt.originalArgs.amount} to{' '}
                {interrupt.originalArgs.recipient}
              </p>
              <button
                disabled={!interrupt.canResolve || resuming}
                onClick={() => interrupt.resolveInterrupt(true)}
              >
                Approve
              </button>
              <button
                disabled={!interrupt.canResolve || resuming}
                onClick={() => interrupt.resolveInterrupt(false)}
              >
                Reject
              </button>
            </article>
          )
        }
        return <article key={interrupt.id}>Unsupported: {interrupt.kind}</article>
      })}

      <button onClick={() => resolveInterrupts(true)} disabled={resuming}>
        Approve all
      </button>
      <button onClick={() => cancelInterrupts()} disabled={resuming}>
        Cancel all
      </button>
    </section>
  )
}
```

## Resolve every item from one callback

`resolveInterrupts(callback)` runs your callback once per item inside a single
synchronous transaction. It must resolve or cancel every item. If it throws or
leaves one item unanswered, nothing submits:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

Two shortcuts cover the common cases:

- `resolveInterrupts(true)` / `resolveInterrupts(false)` approves or rejects the
  whole queue. It works only when every item is a tool approval that needs no
  payload or edits. Generic items, mixed queues, or required payloads are
  rejected.
- `cancelInterrupts()` cancels every item with no payload.

## When an answer is wrong

A bad answer does not tear down the queue. The item keeps your last valid draft,
shows what went wrong, and lets you fix it and resubmit. Errors come in two
places, and you render both.

Each item carries its own `errors`: a bad payload, invalid edited args, or an
expired item. The root `interruptErrors` carries failures for the whole batch:
transport problems, server rejections, and errors for the internal client-tool
steps that never show up as their own item.

This component renders both, gates its buttons correctly, and offers the two
recovery paths:

```tsx
// app/robust-queue.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Move money between accounts',
  needsApproval: true,
  inputSchema: z.object({
    recipient: z.string(),
    amount: z.number(),
  }),
  outputSchema: z.object({ receiptId: z.string() }),
}).client()

export function RobustQueue() {
  const { interrupts, interruptErrors, retryInterrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  // Retry only helps a transport failure. Expired or stale batches can't be
  // retried, so don't offer it for those.
  const canRetry = interruptErrors.some((error) => error.code === 'transport')

  return (
    <section>
      {interrupts.map((interrupt) => {
        if (
          interrupt.kind !== 'tool-approval' ||
          interrupt.toolName !== 'transfer'
        ) {
          return null
        }

        // canResolve reflects the schema and binding, not the live phase, so
        // also gate on the item's status and the run being busy.
        const busy = interrupt.status === 'submitting' || resuming

        return (
          <article key={interrupt.id}>
            <p>
              {interrupt.originalArgs.amount} to{' '}
              {interrupt.originalArgs.recipient}
            </p>
            <button
              disabled={!interrupt.canResolve || busy}
              onClick={() => interrupt.resolveInterrupt(true)}
            >
              Approve
            </button>
            <button disabled={busy} onClick={() => interrupt.clearResolution()}>
              Start over
            </button>

            {/* Item errors: bad payload, bad edited args, expired. */}
            {interrupt.errors.map((error) => (
              <p key={`${error.code}:${error.path?.join('.') ?? ''}`}>
                {error.message}
              </p>
            ))}
          </article>
        )
      })}

      {/* Batch errors: transport, server, and hidden client-tool steps. */}
      {interruptErrors.map((error) => (
        <p key={error.code}>{error.message}</p>
      ))}
      {canRetry ? (
        <button onClick={() => retryInterrupts()} disabled={resuming}>
          Retry
        </button>
      ) : null}
    </section>
  )
}
```

The two recovery paths, side by side:

- `interrupt.clearResolution()` drops one item's draft so the user can answer it
  again from scratch. Fixing a form and calling `resolveInterrupt` again works
  too, the draft is replaced, not stacked.
- `retryInterrupts()` re-sends the whole staged batch after a transport failure.
  It does nothing for expired or stale batches, start a fresh run to get a new
  set of interrupts for those.
