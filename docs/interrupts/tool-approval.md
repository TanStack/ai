---
title: Tool Approval
id: interrupts-tool-approval
order: 2
description: "Stop a tool call until a person says yes or no, show the question in the chat, and continue the run with the decision."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - approvalSchema
  - resolveInterrupt
---

You have a tool that must not run until a person says yes: transferring money,
deleting a record, sending a message. The model can plan the call, but a human
must approve it first.

Mark the tool `needsApproval: true`. Each call then pauses the run, shows an
approve or reject prompt in the chat, and continues with the decision.

## Quick setup

### 1. Define the tool

Put the tool in a file that the server and the browser both import, so both
sides get the same types:

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

### 2. Serve it

The server runs the tool only after the user approves. Forward `parentRunId`
and `resume` into `chat()`. The browser sends back the message history and the
decision, so `chat()` can rebuild the paused call with no database:

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
    adapter: openaiText('gpt-6.1-sol'),
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

### 3. Render it in the chat

Pass the shared tool to `useChat`, so `toolName` and `originalArgs` are typed.
When the run pauses, the approval shows up in `interrupts`. Resolve it on the
item with `interrupt.resolveInterrupt(...)`:

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

### 4. Try it

Ask the model to send 20 to Ada. The chat stops and asks "Send 20 to Ada?".
Click Approve. The tool runs, and the model replies with the receipt.

## How it works

With one pending decision, `resolveInterrupt` submits at once. There is no
extra step. To answer several decisions together, see
[Multiple Interrupts](./multiple).

Approval works the same for server tools and client tools. Only the place where
the tool runs after the yes is different:

- A **server tool** (`.server()`) runs on the server.
- A **client tool** (`.client()`) runs in the browser.

The approval interrupt is the same in both cases, so the UI above does not
change. A client tool without `needsApproval` runs on its own and never pauses.
See [Client Tools](../tools/client-tools).

Reject and cancel are two different answers:

- `interrupt.resolveInterrupt(false)` is a no. The run continues, and the model
  sees the rejection, so it can respond to it.
- `interrupt.cancel()` drops the pause with no answer. It has no payload and
  does not use the reject branch.

If the user answered no, use reject. If the user leaves the workflow without an
answer, use cancel.

## Add data to the decision

Sometimes the decision needs data: a review note, or the reason for a no. Add
an `approvalSchema` to the tool definition. Use one schema for both branches,
or an `{ approve, reject }` map for a different payload per branch:

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

Now each decision carries a payload. On approval, you can also replace the
arguments:

```ts ignore
// Approve with the approve-branch payload.
interrupt.resolveInterrupt(true, { payload: { note: 'Reviewed' } })

// Approve, but replace the arguments first.
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Capped to policy' },
})

// Reject with the reject-branch payload.
interrupt.resolveInterrupt(false, { payload: { reason: 'Too large' } })
```

Without an `approvalSchema`, `resolveInterrupt(true)` and
`resolveInterrupt(false)` are all you need.

## Advanced

### Rules for `editedArgs`

- Only approval accepts `editedArgs`. Reject does not.
- `editedArgs` is a full replacement of the arguments, not a merge.
- The tool `inputSchema` validates `editedArgs`.
- The server validates the full decision again before it runs the tool.

### Where `editedArgs` and `payload` go on the server

`editedArgs` become the arguments that the tool runs with. You wire up nothing:
`execute` always gets the final input, edited or not, already validated against
`inputSchema`:

```ts
// server/transfer-tool.ts
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
})

export const transfer = transferTool.server(async (input) => {
  // input holds the model's arguments, or the approver's editedArgs when
  // they changed them. The code is the same in both cases.
  return {
    receiptId: `${input.recipient}-${input.amount}-${crypto.randomUUID()}`,
  }
})
```

The `payload` is decision data, not tool input. Each branch uses it in a
different way:

- **Reject payload.** It goes back to the model as the failed result of
  the call. Then the model can read why the call was refused.
  `resolveInterrupt(false, { payload: { reason: 'Too large' } })` gives
  `{ reason: 'Too large' }` to the model as the result of that call.
- **Approve payload.** It is validated decision data for your app: an audit
  log, a "reviewed by" record, an analytics event. `execute` does not get it.
  If the tool needs a value from the approver, put that value in `editedArgs`.
