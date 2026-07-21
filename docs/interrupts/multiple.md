---
title: Multiple Interrupts
id: interrupts-multiple
order: 3
description: "Render a queue of pending interrupts and resolve them item-by-item or as one atomic batch."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - resolveInterrupts
  - batch approval
  - cancelInterrupts
---

# Multiple Interrupts

A single run can pause on several interrupts at once. You have a list of pending
decisions; you want to render each one and submit them together.

## How a batch submits

Item methods (`resolveInterrupt`, `cancel`, `clearResolution`) return `void` —
they stage local state. Each staged item is held until the batch is complete;
the **last valid item auto-submits the whole batch**, and the server accepts all
resolutions atomically or none. There is no per-item network call.

## Render the queue

Map over `interrupts` and switch on `kind`. Each item carries `canResolve` and
its own `errors`:

```tsx
// app/interrupt-queue.tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { transferTool } from '../tools/transfer'

export function InterruptQueue() {
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
                {interrupt.originalArgs.amount} → {interrupt.originalArgs.recipient}
              </p>
              <button
                disabled={!interrupt.canResolve || resuming}
                onClick={() =>
                  interrupt.resolveInterrupt(true, { payload: { note: 'ok' } })
                }
              >
                Approve
              </button>
              <button
                disabled={!interrupt.canResolve || resuming}
                onClick={() =>
                  interrupt.resolveInterrupt(false, { payload: { reason: 'no' } })
                }
              >
                Reject
              </button>
            </article>
          )
        }
        return <article key={interrupt.id}>Unsupported: {interrupt.kind}</article>
      })}

      <button onClick={() => void cancelInterrupts()}>Cancel all</button>
    </section>
  )
}
```

## Resolve the whole batch in one transaction

`resolveInterrupts(callback)` runs your callback against every item inside one
synchronous transaction. It must resolve or cancel each item and cannot be
async — if it throws or leaves an item unresolved, nothing submits:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

The boolean shorthand `resolveInterrupts(true)` / `resolveInterrupts(false)` is
valid **only** when every **public** item is a tool approval whose branch needs
no payload or edits. It's rejected for generic items, mixed batches, or required
branch payloads. (Client-tool execution is internal and never appears in
`interrupts`.) `cancelInterrupts()` is the payloadless all-items cancel.

## Errors and retry

Each item exposes `errors` (payload, edited-args, output, expiry, binding).
Root `interruptErrors` reports batch, transport, and validation failures —
including failures for internal client-tool items that are hidden from the
public list.

`canResolve` means the binding/schema allows resolution at hydrate time. It does
**not** flip when an item is submitting or expired on the server — gate the UI
on `status`, `resuming`, and `errors` for those lifecycle states.

A failed candidate doesn't erase the last valid staged response — fix the form
and call `resolveInterrupt` again, `clearResolution()` to start that item over,
or `retryInterrupts()` after a *retryable* submission failure. Stale and expired
errors are non-retryable — start a fresh run to get a new interrupt batch.
