---
title: Tool Approval Flow
id: tool-approval-flow
order: 5
description: 'Require user approval before executing sensitive tools in TanStack AI — approval states, deny flows, and batched approvals with needsApproval.'
keywords:
  - tanstack ai
  - tool approval
  - needsApproval
  - user consent
  - sensitive tools
  - approval flow
  - human-in-the-loop
---

The tool approval flow allows you to require user approval before executing sensitive tools, giving users control over actions like sending emails, making purchases, or deleting data. A tool call moves through the `ToolCallState` lifecycle:

The current client API exposes approvals as bound AG-UI interrupts. For the
complete server/client lifecycle, atomic batch controls, generic interrupts,
and recovery, see [Interrupts](../interrupts/overview). For deprecated API mapping,
see [Migrate to AG-UI interrupts](../interrupts/migration).

1. **`awaiting-input`** — Tool call started, no arguments yet
2. **`input-streaming`** — Arguments arriving incrementally
3. **`input-complete`** — All arguments received
4. **`approval-requested`** — Waiting for user approval (only if `needsApproval: true`)
5. **`approval-responded`** — User approved or denied

After `approval-responded` the call executes (if approved). Although `complete` exists in the `ToolCallState` union, the runtime never transitions the tool-call part to it — the result surfaces as a populated `part.output` plus a sibling `tool-result` part whose own state is `complete` or `error`.

Approvals run ephemerally: the run resumes from the full client message
history that the browser sends back, so a stateless route needs no server
storage to rebuild the paused call.

When a tool requires approval, the typical flow is:

1. Model calls the tool
2. Tool execution is paused
3. User is prompted to approve or deny
4. Tool executes (if approved) or is cancelled (if denied)
5. Conversation continues with the result

## Resolve an approval interrupt

Without an `approvalSchema`, use the boolean shorthand. Approval uses the
original tool input by default:

```ts ignore
const approval = interrupts.find(
  (interrupt) => interrupt.kind === 'tool-approval',
)

if (approval?.kind === 'tool-approval') {
  approval.resolveInterrupt(true)
}
```

An `approvalSchema` can define separate application payloads for approval and
rejection:

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

Keep branch data under `payload`. Approved arguments can optionally be replaced
in full with `editedArgs`; rejection never accepts edits:

```ts ignore
approval.resolveInterrupt(true, {
  editedArgs: { amount: 12, recipient: 'Ada' },
  payload: { note: 'Reviewed' },
})

approval.resolveInterrupt(false, {
  payload: { reason: 'Policy limit' },
})
```

Denial and cancellation are different. `resolveInterrupt(false, ...)` records a
resolved rejection for the continuation. `cancel()` is payloadless and
does not select the reject schema:

```ts ignore
approval.cancel()
```

A singleton submits after its valid resolution. Multiple items stage until all
are valid, then submit atomically. Use root `resolveInterrupts(...)` for one
synchronous batch transaction. See [Multiple Interrupts](../interrupts/multiple).

## Enabling Approval

Tools can be marked as requiring approval by setting `needsApproval: true` in the definition:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { emailService } from './email-service'

// Step 1: Define tool with approval requirement
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
  needsApproval: true, // This tool requires approval
})

// Step 2: Create server implementation
const sendEmail = sendEmailDef.server(async ({ to, subject, body }) => {
  // Only executes if approved
  await emailService.send({ to, subject, body })
  return { success: true, messageId: '...' }
})
```

## Server-Side Approval

On the server, tools with `needsApproval: true` will pause execution and wait for approval:

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

## Approval UI

Render pending approvals from the hook's `interrupts` array. Each
`tool-approval` interrupt carries the tool name, the original arguments, and a
`resolveInterrupt` you call with the user's decision. The array is already
tool-agnostic, so one block handles every tool marked `needsApproval: true` —
no per-tool `part.name` branch and no reading `part.approval` off a mixed union:

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
      {/* ...render messages... */}
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

`canResolve` stays `false` until the interrupt is bound and ready; `resuming` is
`true` while a resolution is in flight, so gate the buttons on both.

## Migrating from `addToolApprovalResponse`

Older UIs read `part.approval` off tool-call parts and called
`addToolApprovalResponse({ id, approved })`. That API is deprecated. Render from
the `interrupts` array and call `resolveInterrupt` instead (see [Approval
UI](#approval-ui) above) — it is tool-agnostic by default, so the per-tool
narrowing the part-based pattern needed goes away. For the full mapping, see
[Migrate to AG-UI interrupts](../interrupts/migration).

## Client Tools with Approval

Client tools can also require approval:

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

// tools/definitions.ts
const deleteLocalDataDef = toolDefinition({
  name: 'delete_local_data',
  description: 'Delete data from local storage',
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    deleted: z.boolean(),
  }),
  needsApproval: true, // Requires approval even on client
})

// Client: Create implementation
const deleteLocalData = deleteLocalDataDef.client((input) => {
  // This will only execute after approval
  localStorage.removeItem(input.key)
  return { deleted: true }
})

const { messages, interrupts } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  // Pass client tools as a plain array — literal tool-name inference works
  // without a wrapper. The approval surfaces as a `tool-approval` interrupt you
  // resolve from `interrupts` (see Approval UI); the tool runs on approval.
  tools: [deleteLocalData], // Automatic execution after approval
})
```

## Example: E-commerce Purchase

```typescript
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createOrder } from './orders'

// Define tool with approval requirement
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

// Create server implementation
const purchaseItem = purchaseItemDef.server(
  async ({ itemId, quantity, price }) => {
    const order = await createOrder({ itemId, quantity, price })
    return { orderId: order.id, total: price * quantity }
  },
)
```

The user will see an approval prompt showing the item, quantity, and price before the purchase is made. The tool will only execute after the user approves.

## Best Practices

- **Use approval for sensitive operations** - Sending emails, making payments, deleting data
- **Show clear information** - Display what the tool will do before approval
- **Provide context** - Show tool arguments in a readable format
- **Handle denial gracefully** - Don't break the conversation if a tool is denied
- **Timeout handling** - Consider timeouts for approval requests

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Client Tools](./client-tools) - Learn about client-side tool execution
