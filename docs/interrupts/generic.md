---
title: Generic Interrupts
id: interrupts-generic
order: 4
description: "Pause a run to ask the user something that isn't a tool call, validate their answer, and continue."
keywords:
  - tanstack ai
  - generic interrupt
  - responseSchema
  - fromJSONSchema
  - resolveInterrupt
---

# Generic Interrupts

Sometimes the agent needs an answer that isn't a tool call at all. Mid-run it has
to ask the user to pick a shipping speed, confirm an address, or choose which of
two drafts to keep. There's no tool to approve here, just a question your app
asks and the user answers.

A generic interrupt is that question. You end the run with a pause that carries a
`responseSchema` describing the answer you expect, render a form for it, and
continue the run once the user submits a valid value.

Because the pause is defined by your app, you own both ends: the server emits it,
and the client resolves it.

## Resolve it on the client

The schema arrives over the wire, so its value is `unknown` at compile time.
Validate the user's answer against it before resolving. Build the value from your
form fields and pass it straight to the schema:

```tsx
// app/refund-reason.tsx
import { useState } from 'react'
import type { GenericAGUIInterrupt } from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

// You emitted this pause, so you know the shape of the answer. Here it is a
// single reason string chosen from a dropdown.
function RefundReasonForm({ interrupt }: { interrupt: GenericAGUIInterrupt }) {
  const [reason, setReason] = useState('damaged')
  const [errors, setErrors] = useState<ReadonlyArray<string>>([])

  const submit = () => {
    if (!interrupt.responseSchema) {
      setErrors(['This interrupt has no response schema.'])
      return
    }
    const result = z
      .fromJSONSchema(interrupt.responseSchema)
      .safeParse({ reason })
    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message))
      return
    }
    interrupt.resolveInterrupt(result.data)
    setErrors([])
  }

  return (
    <div>
      <p>{interrupt.message ?? interrupt.reason}</p>
      <select value={reason} onChange={(event) => setReason(event.target.value)}>
        <option value="damaged">Damaged</option>
        <option value="wrong-item">Wrong item</option>
        <option value="no-longer-needed">No longer needed</option>
      </select>
      <button disabled={!interrupt.canResolve} onClick={submit}>
        Submit
      </button>
      {errors.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

export function RefundReasons() {
  const { interrupts } = useChat({
    threadId: 'order-7',
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <>
      {interrupts.map((interrupt) =>
        interrupt.kind === 'generic' ? (
          <RefundReasonForm key={interrupt.id} interrupt={interrupt} />
        ) : null,
      )}
    </>
  )
}
```

`z.fromJSONSchema` gives you a runtime validator, not a trustworthy static type.
The library does not validate the wire schema for you. Whatever you pass to
`resolveInterrupt` is sent as-is, so validate the value here on the client, and
again on the server if you need to trust it, the same way you would treat any
other user input.

## Emit it on the server

Tool approvals are rebuilt by `chat()` from message history for free. Generic
pauses are not, because only your app knows when to ask and what to ask. You emit
the descriptor and validate the answer yourself:

1. End a run with `RUN_FINISHED` and `outcome.type === 'interrupt'`, carrying a
   `generic` descriptor with your `responseSchema`. A small middleware is the
   usual place to do this.
2. On the continuation request, correlate the incoming `resume` against that
   same pending descriptor with `validateInterruptResumeBatch`. It checks the
   batch is complete and matches the pending item; it does not validate your
   generic value, that is yours to do. Then append the answer and continue.

The interrupt lab in `examples/ts-react-chat` has a complete middleware that
emits a generic pause and correlates its answer. Without the server half, a
generic answer fails resume validation with `unknown-interrupt` or
`incomplete-batch`.

> Gating a tool instead of asking a free-form question? A tool
> [approval](./tool-approval) gives you typed branches on top of validation.
