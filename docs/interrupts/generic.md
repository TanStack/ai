---
title: Generic Interrupts
id: interrupts-generic
order: 4
description: "Resolve a schema-driven application pause by validating the wire responseSchema at runtime before submitting."
keywords:
  - tanstack ai
  - generic interrupt
  - responseSchema
  - fromJSONSchema
  - resolveInterrupt
---

# Generic Interrupts

A generic interrupt is any application pause that isn't tied to a tool. It may
carry a Draft 2020-12 `responseSchema`. Because that schema arrives over the
wire, its payload is `unknown` at compile time — so you validate it at runtime
before resolving. You have a schema-bearing `generic` item; you want a form that
only submits valid input.

## Render a validating form

Convert the received schema to a validator with `z.fromJSONSchema`, parse the
editor value as `unknown`, and resolve only on success:

```tsx
// app/generic-interrupt.tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'

export function GenericInterrupt() {
  const { interrupts } = useChat({
    threadId: 'workflow-7',
    connection: fetchServerSentEvents('/api/chat'),
  })
  const [value, setValue] = useState('')
  const [errors, setErrors] = useState<ReadonlyArray<string>>([])

  const generic = interrupts.find((item) => item.kind === 'generic')
  if (generic?.kind !== 'generic') return null

  const submit = () => {
    if (!generic.responseSchema) {
      setErrors(['This interrupt has no response schema.'])
      return
    }
    let candidate: unknown
    try {
      candidate = JSON.parse(value)
    } catch {
      setErrors(['Enter valid JSON.'])
      return
    }
    const result = z.fromJSONSchema(generic.responseSchema).safeParse(candidate)
    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message))
      return
    }
    generic.resolveInterrupt(result.data)
    setErrors([])
  }

  return (
    <article>
      <p>{generic.message ?? generic.reason}</p>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} />
      <button disabled={!generic.canResolve} onClick={submit}>
        Submit
      </button>
      {errors.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </article>
  )
}
```

The conversion gives you a runtime validator, not a trustworthy static type.
TanStack AI still runs canonical Draft 2020-12 validation in the client, and
server validation stays authoritative — an invalid or unsupported wire schema
surfaces an `invalid-response-schema` error instead of slipping through.

Applications that emit generic descriptors must send JSON-compatible Draft
2020-12 schemas and validate the resume batch server-side. Prefer a shared
`approvalSchema` for tool approvals instead — it adds compile-time branch
inference on top of runtime validation. See [Tool Approval](./tool-approval).
