---
title: Generic Interrupts
id: interrupts-generic
order: 4
description: "Pause a run to ask a non-tool question, validate the answer, continue."
keywords:
  - tanstack ai
  - generic interrupt
  - responseSchema
  - fromJSONSchema
  - resolveInterrupt
---

# Generic Interrupts

If the agent needs a free-form answer (shipping speed, draft choice) that is not a tool call → emit a generic interrupt with `responseSchema`, render a form, resolve with a validated value.

You own both ends: server emits, client resolves.

## Resolve on the client

Wire schema is `unknown` at compile time. Validate before resolving:

```tsx
// app/refund-reason.tsx
import { useState } from 'react'
import type { GenericAGUIInterrupt } from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

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

`z.fromJSONSchema` is a runtime validator, not a static type. The library does not validate the wire schema for you. Treat `resolveInterrupt` input like any other user input — validate client-side, and again on the server if you need to trust it.

## Emit on the server

Tool approvals rebuild from history via `chat()`. Generic pauses do not — only your app knows when/what to ask.

1. End a run with `RUN_FINISHED` and `outcome.type === 'interrupt'`, carrying a `generic` descriptor with your `responseSchema` (middleware is the usual place).
2. On continuation, correlate `resume` with `validateInterruptResumeBatch` (checks batch completeness / pending match — not your generic value). Append the answer and continue.

Full middleware example: interrupt lab in `examples/ts-react-chat`. Without the server half, resume fails with `unknown-interrupt` or `incomplete-batch`.

> Gating a tool instead? Use [approval](./tool-approval) for typed branches on top of validation.
