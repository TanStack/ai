---
title: Tool Approval
id: interrupts-tool-approval
order: 2
description: "Pause a tool call for a human yes or no, render it inside the chat, and continue the run once the user decides."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - approvalSchema
  - resolveInterrupt
---

# Tool Approval

You have a tool that shouldn't run until a person says yes: transferring money,
deleting a record, sending a message. You want the model to plan the call, then
wait for a human to approve it before anything happens.

By the end of this page the chat pauses on that call, shows an approve or reject
prompt inline, and continues the run with the user's decision.

## Define the tool

`needsApproval: true` turns the call into an approval pause. Define the tool once
and share it, so the server and the browser infer the same types:

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
})
```

## Serve it

The server runs the tool only after the user approves. It needs no database: the
browser sends the message history and the `resume` decision back, so forward
`parentRunId` and `resume` into `chat()` and it rebuilds the paused call.

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

## Render it in the chat

Pass the shared tool to `useChat` so `toolName` and `originalArgs` are typed.
Render your messages as usual, and when the run pauses, the pending approval
shows up in `interrupts` right alongside the conversation. Resolve it straight
from the item with `interrupt.resolveInterrupt(...)`:

```tsx
// app/transfer-chat.tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { transferTool } from '../tools/transfer'

export function TransferChat() {
  const { messages, sendMessage, interrupts, resuming } = useChat({
    threadId: 'account-42',
    connection: fetchServerSentEvents('/api/chat'),
    tools: [transferTool] as const,
  })
  const [input, setInput] = useState('')

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}: </strong>
          {message.parts.map((part, i) =>
            part.type === 'text' ? <span key={i}>{part.content}</span> : null,
          )}
        </div>
      ))}

      {interrupts.map((interrupt) => {
        if (
          interrupt.kind !== 'tool-approval' ||
          interrupt.toolName !== 'transfer'
        ) {
          return null
        }
        return (
          <div key={interrupt.id} className="approval">
            <p>
              Send {interrupt.originalArgs.amount} to{' '}
              {interrupt.originalArgs.recipient}?
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
          </div>
        )
      })}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
```

The approve and reject buttons call `resolveInterrupt` on the item itself. For a
single pending decision that submits right away, no extra step. Resolving
several at once is covered in [Multiple Interrupts](./multiple).

## Server tools and client tools

Approval works the same for both. The difference is only where the tool runs
after the user says yes.

- A **server tool** (`.server()`) runs on the server once approved.
- A **client tool** (`.client()`) runs in the browser once approved.

The approval interrupt is identical in both cases, so the UI above does not
change. A client tool without `needsApproval` runs on its own and never pauses,
see [Client Tools](../tools/client-tools).

## Carry data on the decision

Attach an `approvalSchema` when the decision itself needs typed data, like a
review note or a rejection reason. Add it to the tool definition. Use one schema
for both branches, or an `{ approve, reject }` map for different payloads:

```ts ignore
export const transferTool = toolDefinition({
  name: 'transfer',
  // ...same inputSchema and outputSchema as above
  needsApproval: true,
  approvalSchema: {
    approve: z.object({ note: z.string().min(1) }),
    reject: z.object({ reason: z.string().min(1) }),
  },
})
```

Now the decision carries a payload, and approval can also replace the arguments:

```ts ignore
// Approve as-is, with the approve-branch payload.
interrupt.resolveInterrupt(true, { payload: { note: 'Reviewed' } })

// Approve, but replace the arguments first. editedArgs is a full replacement,
// not a merge, and is validated against the tool's inputSchema.
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Capped to policy' },
})

// Reject, with the reject-branch payload.
interrupt.resolveInterrupt(false, { payload: { reason: 'Too large' } })
```

Only approval accepts `editedArgs`. Without an `approvalSchema` the boolean
shorthand `resolveInterrupt(true)` / `resolveInterrupt(false)` is all you need.
The server re-validates the whole decision before it runs the tool.

## Consume the decision on the server

The two fields you sent land in two different places, so pick the one that fits
what you need.

`editedArgs` become the arguments the tool runs with. This is how a human
reshapes what the tool does before it runs. There is nothing to wire up: your
`execute` always receives the final input, edited or not, already validated
against `inputSchema`:

```ts
// server/transfer-tool.ts
import { transferTool } from '../tools/transfer'

export const transfer = transferTool.server(async (input) => {
  // input.amount / input.recipient are the model's arguments, or the
  // approver's editedArgs when they changed them. Same code either way.
  return {
    receiptId: `${input.recipient}-${input.amount}-${crypto.randomUUID()}`,
  }
})
```

The `payload` is decision data, not tool input, and the two branches use it
differently:

- The **reject** payload comes back as the tool's failed result, so the model
  reads why it was refused and can respond. `resolveInterrupt(false, { payload:
  { reason: 'Too large' } })` hands `{ reason: 'Too large' }` to the model as
  the result of that call.
- The **approve** payload is validated decision data for your own app: an audit
  log, a "reviewed by" record, an analytics event. It is not passed to
  `execute`. If the tool itself needs a value from the approver, put it in
  `editedArgs` (part of the tool input) rather than the payload.

## Reject is not cancel

`resolveInterrupt(false, ...)` is a resolved no. The run continues and the model
sees the rejection (and its reject payload as the tool result), so it can
respond to it.

`interrupt.cancel()` abandons the pause. It carries no payload and does not pick
the reject branch. Reject when the user answered no; cancel when the workflow is
dropped without an answer.

> Resolving a queue of approvals together? See [Multiple Interrupts](./multiple).
