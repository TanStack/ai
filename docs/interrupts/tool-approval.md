---
title: Tool Approval
id: interrupts-tool-approval
order: 2
description: "Gate a tool call behind a typed approve/reject decision, then render and resolve that single interrupt in the UI."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - approvalSchema
  - resolveInterrupt
---

# Tool Approval

You have a tool that shouldn't run until a person says yes. By the end you'll
have a typed approval interrupt and a component that renders it and resolves the
decision.

## Define the tool

`needsApproval: true` turns the call into an approval interrupt. An optional
`approvalSchema` attaches typed data to the decision — one schema for both
branches, or a `{ approve, reject }` map for different payloads. Share the
definition so server and client infer the same types:

```ts
// tools/transfer.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const transferTool = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds to a recipient',
  needsApproval: true,
  inputSchema: z.object({
    amount: z.number().positive(),
    recipient: z.string().min(1),
  }),
  outputSchema: z.object({ receiptId: z.string() }),
  approvalSchema: {
    approve: z.object({ note: z.string().min(1) }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})
```

## Serve it

The server executes the tool only after the batch is accepted. No persistence is
required — the client sends the full history, so a stateless route can rebuild
the interrupted call and validate the batch before running anything.

```ts
// app/api/chat/route.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { transferTool } from '../../../tools/transfer'

const transfer = transferTool.server(
  async (input: { amount: number; recipient: string }) => ({
    receiptId: `${input.recipient}-${input.amount}-${crypto.randomUUID()}`,
  }),
)

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    parentRunId: params.parentRunId,
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [transfer],
  })
  return toServerSentEventsResponse(stream)
}
```

## Render and resolve it

Pass the shared definition to `useChat` so `toolName`, `originalArgs`, edits, and
branch payloads are inferred. Find the pending `tool-approval` item and resolve
it:

```tsx
// app/transfer-approval.tsx
import type { ItemInterruptError } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { transferTool } from '../tools/transfer'

export function TransferApproval() {
  const { interrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })

  const transfer = interrupts.find(
    (item) => item.kind === 'tool-approval' && item.toolName === 'transfer',
  )
  if (transfer?.kind !== 'tool-approval' || transfer.toolName !== 'transfer') {
    return null
  }

  return (
    <article>
      <p>
        Transfer {transfer.originalArgs.amount} to {transfer.originalArgs.recipient}?
      </p>
      <button
        disabled={!transfer.canResolve || resuming}
        onClick={() =>
          transfer.resolveInterrupt(true, { payload: { note: 'Reviewed' } })
        }
      >
        Approve
      </button>
      <button
        disabled={!transfer.canResolve || resuming}
        onClick={() =>
          transfer.resolveInterrupt(false, { payload: { reason: 'Too large' } })
        }
      >
        Reject
      </button>
      {transfer.errors.map((error: ItemInterruptError) => (
        <p key={`${error.code}:${error.path?.join('.') ?? ''}`}>{error.message}</p>
      ))}
    </article>
  )
}
```

A valid resolution for a single-item batch submits automatically — no extra
"submit" call.

## Approve, edit, reject

```ts ignore
// Approve as-is.
transfer.resolveInterrupt(true, { payload: { note: 'Reviewed' } })

// Approve with edited arguments — a validated FULL replacement, not a merge.
transfer.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Capped to policy' },
})

// Reject — the reject branch schema validates its own payload.
transfer.resolveInterrupt(false, { payload: { reason: 'Policy limit' } })
```

Only approval accepts `editedArgs`; rejection never does. Branch data always
goes under `payload`. Without an `approvalSchema`, the boolean shorthand
`resolveInterrupt(true)` / `resolveInterrupt(false)` is valid on its own. The
server re-validates the whole envelope before executing.

## Rejection is not cancellation

`resolveInterrupt(false, ...)` is a *resolved denial*: the continuation receives
the denial (and any reject payload) so the model can respond to it.
`cancel()` produces AG-UI `status: 'cancelled'`, carries no payload, and does not
select the reject branch. Deny when the user answered "no"; cancel when the
workflow is abandoned without an answer.

> Resolving several approvals together? See [Multiple Interrupts](./multiple).
> Defining approval on the tool side is covered in
> [Tool Approval Flow](../tools/tool-approval).
