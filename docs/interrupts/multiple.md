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

Each item exposes its own `errors` (bad payload, bad edited args, expired). The
root `interruptErrors` reports failures for the whole batch, including transport
problems and errors for internal client-tool steps that never appear in the
list.

`canResolve` tells you the item can be answered at all, based on its schema and
binding. It does not flip while a batch is submitting or after an item expires,
so gate your buttons on `resuming` and the item's `status` and `errors` for
those states.

A rejected answer does not wipe your last valid draft. Fix the form and call
`resolveInterrupt` again, use `clearResolution()` to start one item over, or
`retryInterrupts()` after a transport failure. Expired or stale batches can't be
retried, start a fresh run to get a new set of interrupts.
