---
title: Multiple Interrupts
id: interrupts-multiple
order: 3
description: "Show a queue of pending decisions and resolve them one by one or all at once, as one validated batch."
keywords:
  - tanstack ai
  - ag-ui interrupts
  - resolveInterrupts
  - batch approval
  - cancelInterrupts
---

One run can pause on several interrupts at once. Render the queue, then send every answer in one request.

`useChat` collects the answers as local drafts. It sends them together when
every item has an answer, and the server validates the full batch.

## Quick setup

This page uses the `transfer` tool from [Tool Approval](./tool-approval).

### 1. Render the queue

Map over `interrupts` and switch on `kind`. Give each item its own buttons, and
add root buttons for the full queue:

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

### 2. Try it

Ask the model for two transfers in one message. The queue shows two items.
Approve one, then the other. The client sends both answers in one request, and
the run continues.

## How it works

You can resolve items in two ways:

- **Per item.** Call `interrupt.resolveInterrupt(...)` or `interrupt.cancel()`
  where you render the item.
- **From the root.** Call `resolveInterrupts(...)` or `cancelInterrupts()` once
  for the full queue.

Both ways stage local drafts. The client sends nothing until every pending item
has an answer. Then it submits the full set at once. The server validates the
full set before it accepts any item.

In a mixed batch, `kind` tells you what each item is:

- `tool-approval`: a tool call. It has its own approval controls.
- `generic` with a `definitionId`: a registered generic interrupt. The
  definition id narrows its payload and response types.
- `generic` without a `definitionId`: an external interrupt with a valid
  binding. Its controls are untyped, and it joins the batch.
- `unbound`: the binding is missing, malformed, or of an unsupported version.
  The item is visible, has no controls, and does not block the other items.

## Resolve every item from one callback

`resolveInterrupts(callback)` runs your callback once for each item that can
resume, in one synchronous transaction. This includes external generic items
with a valid binding. The callback must resolve or cancel every item. If it
throws or skips an item, nothing is sent:

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

- `resolveInterrupts(true)` or `resolveInterrupts(false)` approves or rejects
  the full queue. It works only when every item is a tool approval that needs
  no payload and no edits. It rejects generic items, mixed queues, and required
  payloads.
- `cancelInterrupts()` cancels every item that can resume, with no payload.
  This includes the client-tool steps that `interrupts` does not show.

## When an answer is wrong

A bad answer does not clear the queue. The item keeps your last valid draft and
shows the error. The user fixes it and submits again.

Errors come in two places. Show both:

- `interrupt.errors`, on each item: a bad payload, bad edited arguments, or an
  expired item.
- `interruptErrors`, on the root: errors for the full batch. These are transport
  errors, server rejections, and errors for internal client-tool steps that
  have no item of their own.

This component shows both kinds of error, disables its buttons at the right
times, and offers the two ways to recover:

```tsx
// app/error-queue.tsx
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

export function ErrorQueue() {
  const { interrupts, interruptErrors, retryInterrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  // Retry helps only after a transport failure. Expired or stale batches
  // cannot be retried, so do not offer it for those.
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

        // canResolve reflects the schema and binding, not the live phase.
        // Also check the item status and whether the run is busy.
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

The two ways to recover:

- `interrupt.clearResolution()` drops the draft of one item, so the user can
  answer it again. You can also call `resolveInterrupt` again after the user
  fixes a form. The new draft replaces the old one.
- `retryInterrupts()` sends a staged batch again after a transport failure. It
  does nothing for expired or stale batches. For those, start a new run to get
  a new set of interrupts.

## Advanced

### Persistence and batch commits

With persistence, `InterruptStore.commitBatch()` can commit the validated batch
in one database transaction. If the store has no `commitBatch()`, a fallback
writes the items one after the other. That fallback is not atomic.

With that sequential storage, a failed request can already have committed some
items. Before you call `retryInterrupts()`, reload the current pending records.
Then retry only the rest of the batch.

### Restored and live batches

`onInterruptStateChange` gets a `source` with each update:

- `hydrate`: the batch came back from a restored snapshot.
- `live`: the batch came from the stream or from the client in this session.

Use it to apply a different policy to restored batches. Cancellation still
applies to every item in the batch that can resume.
