---
title: Tool Approval Flow
id: tool-approval-flow
order: 5
description: "Gate sensitive tools with needsApproval — resolveInterrupt, schemas, batches, client tools."
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - user consent
  - sensitive tools
  - approval flow
  - human-in-the-loop
---

If a tool must not run until the user decides → set `needsApproval: true` and resolve from `useChat().interrupts`.

Full lifecycle / batches / recovery: [Interrupts](../interrupts/overview). Deprecated API map: [Migrate to AG-UI interrupts](../interrupts/migration).

## Call states

1. `awaiting-input` — call started
2. `input-streaming` — args arriving
3. `input-complete` — args ready
4. `approval-requested` — only if `needsApproval: true`
5. `approval-responded` — user decided

After approval, the tool runs. The call part does **not** move to `complete` — result is `part.output` + sibling `tool-result` (`complete` / `error`).

Approvals are ephemeral: continuation rebuilds from full client message history (no server storage required).

## Resolve an interrupt

Boolean shorthand (default — original tool input):

```ts ignore
const approval = interrupts.find(
  (interrupt) => interrupt.kind === 'tool-approval',
)

if (approval?.kind === 'tool-approval') {
  approval.resolveInterrupt(true)
}
```

`approvalSchema` for separate approve/reject payloads:

```ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const transferDefinition = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({
    amount: z.number().positive(),
    recipient: z.string(),
  }),
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
})
```

Branch data under `payload`. Replace args only on approve via `editedArgs`:

```ts ignore
approval.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Reviewed' },
})

approval.resolveInterrupt(false, {
  payload: { reason: 'Policy limit' },
})
```

| Method | Meaning |
| --- | --- |
| `resolveInterrupt(false, …)` | Resolved rejection for continuation |
| `cancel()` | Payloadless cancel — does not select reject schema |

Singleton submits after valid resolution. Multi-item batches stage until all valid, then submit atomically. Root `resolveInterrupts(...)` for one sync batch — [Multiple Interrupts](../interrupts/multiple).

## Enable approval

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { emailService } from './email-service'

const sendEmailDef = toolDefinition({
  name: 'send_email',
  description: 'Send an email to a recipient',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string(),
  }),
  needsApproval: true,
})

const sendEmail = sendEmailDef.server(async ({ to, subject, body }) => {
  await emailService.send({ to, subject, body })
  return { success: true, messageId: '...' }
})
```

### Server route

No special approval plumbing — normal `chat()`:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { sendEmail } from './tools'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    messages,
    tools: [sendEmail],
  })

  return toServerSentEventsResponse(stream)
}
```

### Approval UI

Render `interrupts` — one block covers every `needsApproval` tool:

```tsx ignore
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { sendEmail } from './tools'

function ChatComponent() {
  const { messages, sendMessage, interrupts, resuming } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [sendEmail],
  })

  return (
    <div>
      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <div key={interrupt.id} className="approval-prompt">
            <p>🔒 Approve {interrupt.toolName}?</p>
            <pre>{JSON.stringify(interrupt.originalArgs, null, 2)}</pre>
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
              Deny
            </button>
          </div>
        ) : null,
      )}
    </div>
  )
}
```

Gate buttons on `canResolve` and `resuming`.

## Migrating from `addToolApprovalResponse`

Deprecated: reading `part.approval` + `addToolApprovalResponse({ id, approved })`. Use `interrupts` + `resolveInterrupt` instead. Full mapping: [Migrate to AG-UI interrupts](../interrupts/migration).

## Client tools with approval

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const deleteLocalDataDef = toolDefinition({
  name: 'delete_local_data',
  description: 'Delete data from local storage',
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    deleted: z.boolean(),
  }),
  needsApproval: true,
})

const deleteLocalData = deleteLocalDataDef.client((input) => {
  localStorage.removeItem(input.key)
  return { deleted: true }
})

const { messages, interrupts } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  tools: [deleteLocalData],
})
```

Resolve from `interrupts`; tool runs after approve.

## Example: purchase

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createOrder } from './orders'

const purchaseItemDef = toolDefinition({
  name: 'purchase_item',
  description: 'Purchase an item from the store',
  inputSchema: z.object({
    itemId: z.string(),
    quantity: z.number(),
    price: z.number(),
  }),
  outputSchema: z.object({
    orderId: z.string(),
    total: z.number(),
  }),
  needsApproval: true,
})

const purchaseItem = purchaseItemDef.server(
  async ({ itemId, quantity, price }) => {
    const order = await createOrder({ itemId, quantity, price })
    return { orderId: order.id, total: price * quantity }
  },
)
```

## Must-do

1. Use approval for email / payments / deletes
2. Show args clearly before decide
3. Handle deny without breaking the thread
4. Gate UI on `canResolve` / `resuming`

## Next

- [Server Tools](./server-tools)
- [Client Tools](./client-tools)
