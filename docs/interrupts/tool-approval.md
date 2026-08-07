---
title: Tool Approval
id: interrupts-tool-approval
order: 2
description: "Pause a tool call for yes/no, render it in chat, continue the run after the user decides."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - approvalSchema
  - resolveInterrupt
---

# Tool Approval

If a tool must not run until a person says yes → set `needsApproval: true`, render `interrupts`, call `resolveInterrupt`.

## 1. Define the tool

Share one definition so server and client infer the same types:

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

## 2. Serve it

Forward `parentRunId` and `resume` into `chat()`. No database: the client resends history and the decision.

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

## 3. Render and resolve

Pass the shared tool to `useChat`. Pending approvals appear in `interrupts`:

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

A single pending decision submits immediately. Several at once → [Multiple Interrupts](./multiple).

## Server tools vs client tools

Approval UI is identical for both:

- **Server tool** (`.server()`) — runs on the server after approve.
- **Client tool** (`.client()`) — runs in the browser after approve.

Without `needsApproval`, a client tool runs on its own and never pauses. See [Client Tools](../tools/client-tools).

## Carry data on the decision

Add `approvalSchema` when the decision needs typed data. One schema for both branches, or `{ approve, reject }`:

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

```ts ignore
// Approve as-is with approve-branch payload
interrupt.resolveInterrupt(true, { payload: { note: 'Reviewed' } })

// Approve and fully replace args (not a merge); validated against inputSchema
interrupt.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Capped to policy' },
})

// Reject with reject-branch payload
interrupt.resolveInterrupt(false, { payload: { reason: 'Too large' } })
```

Only approval accepts `editedArgs`. Without `approvalSchema`, use `resolveInterrupt(true|false)`. Server re-validates the whole decision before running the tool.

## Where fields land on the server

**`editedArgs`** become the tool input. `execute` always receives final input (edited or model-supplied), already validated:

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
  return {
    receiptId: `${input.recipient}-${input.amount}-${crypto.randomUUID()}`,
  }
})
```

**`payload`** is decision data, not tool input:

- **Reject** payload → tool's failed result (model sees why it was refused).
- **Approve** payload → your app only (audit, analytics). Not passed to `execute`. Put values the tool needs in `editedArgs`.

## Reject vs cancel

- `resolveInterrupt(false, ...)` — resolved no; run continues; model sees rejection.
- `interrupt.cancel()` — abandons the pause; no payload; does not pick the reject branch.

> Queue of approvals? [Multiple Interrupts](./multiple).
