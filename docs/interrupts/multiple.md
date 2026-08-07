---
title: Multiple Interrupts
id: interrupts-multiple
order: 3
description: "Render a queue of pending decisions; resolve item-by-item or all at once as one atomic batch."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - resolveInterrupts
  - batch approval
  - cancelInterrupts
---

# Multiple Interrupts

If one run pauses on several decisions → stage answers, then submit the whole batch atomically (all or nothing).

## Two ways to resolve

**Per item** (same as [Tool Approval](./tool-approval)):

```ts ignore
interrupt.resolveInterrupt(true)
```

**Whole queue** via root helpers from `useChat`:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true)
    return
  }
  interrupt.cancel()
})
```

Both stage local drafts. Nothing goes to the server until every pending item has an answer. Server accepts all or none.

## Render the queue

Map `interrupts`; each item has its own `canResolve` and `errors`:

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

## Resolve from one callback

`resolveInterrupts(callback)` runs once per item in a single synchronous transaction. It must resolve or cancel every item. Throw or leave one unanswered → nothing submits:

```ts ignore
resolveInterrupts((interrupt) => {
  if (interrupt.kind === 'tool-approval') {
    interrupt.resolveInterrupt(true, { payload: { note: 'Batch review' } })
    return
  }
  interrupt.cancel()
})
```

Shortcuts:

- `resolveInterrupts(true|false)` — all tool-approval, no payload/edits. Fails on generic items, mixed queues, or required payloads.
- `cancelInterrupts()` — cancel every item with no payload.

## When an answer is wrong

A bad answer keeps the last valid draft and surfaces errors. Render both levels:

- **Item `errors`** — bad payload, invalid edited args, expired item.
- **Root `interruptErrors`** — transport, server rejection, hidden client-tool steps.

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

            {interrupt.errors.map((error) => (
              <p key={`${error.code}:${error.path?.join('.') ?? ''}`}>
                {error.message}
              </p>
            ))}
          </article>
        )
      })}

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

Recovery:

- `interrupt.clearResolution()` — drop one draft; re-answer from scratch (or call `resolveInterrupt` again to replace the draft).
- `retryInterrupts()` — re-send staged batch after transport failure only. Expired/stale batches need a fresh run.
