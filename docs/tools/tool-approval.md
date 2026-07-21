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

## Deprecated approval response compatibility

`addToolApprovalResponse` remains temporarily available for old approval UIs,
but new code should use the bound interrupt API above. A compatibility
`approved: false` is a denial, not a cancellation.

```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

function ChatComponent() {
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => {
            // Check for approval requests
            if (
              part.type === 'tool-call' &&
              part.state === 'approval-requested' &&
              part.approval
            ) {
              return (
                <div key={part.id} className="approval-prompt">
                  <p>Approve: {part.name}</p>
                  <pre>{JSON.stringify(part.input, null, 2)}</pre>
                  <button
                    onClick={() =>
                      addToolApprovalResponse({
                        id: part.approval!.id,
                        approved: true,
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      addToolApprovalResponse({
                        id: part.approval!.id,
                        approved: false,
                      })
                    }
                  >
                    Deny
                  </button>
                </div>
              )
            }
            // ... render other parts
            return null
          })}
        </div>
      ))}
    </div>
  )
}
```

> **Type safety:** When you pass typed `tools` to `useChat`, the `approval`
> field exists **only** on tool-call parts for tools declared with
> `needsApproval: true` — tools without approval have no `approval` field at
> all, so reading it is a compile error that catches a real footgun (checking
> for approval on a tool that can never request it). See
> [Generic approval handlers](#generic-approval-handlers) for how to write a
> tool-agnostic handler under this constraint.

## Generic Approval Handlers

A handler that renders an approval prompt for **any** tool (not one specific
tool) is still fully supported — you just can't read `part.approval` off a
typed mixed tool union without first establishing that the field exists. Pick
whichever of these fits:

**1. Narrow with `'approval' in part`.** This narrows the tool-call union to
exactly the members that can carry approval, so one loop handles every approval
tool with full type safety:

```tsx
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const deleteData = toolDefinition({
  name: 'delete_data',
  description: 'Delete data (requires approval)',
  inputSchema: z.object({ key: z.string() }),
  needsApproval: true,
}).client(async ({ key }) => ({ deleted: key }))

const listData = toolDefinition({
  name: 'list_data',
  description: 'List available keys',
  inputSchema: z.object({}),
}).client(async () => ({ keys: new Array<string>() }))

function ApprovalHandler() {
  const { messages, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: [deleteData, listData],
  })

  return (
    <div>
      {messages.flatMap((message) =>
        message.parts.map((part, i) => {
          // `'approval' in part` narrows the union to `needsApproval` tools,
          // so this single handler covers every approval tool — no per-tool
          // `part.name` branch needed.
          if (
            part.type === 'tool-call' &&
            part.state === 'approval-requested' &&
            'approval' in part &&
            part.approval
          ) {
            return (
              <button
                key={i}
                onClick={() =>
                  addToolApprovalResponse({
                    id: part.approval!.id,
                    approved: true,
                  })
                }
              >
                Approve {part.name}
              </button>
            )
          }
          return null
        }),
      )}
    </div>
  )
}
```

**2. Type a shared component against the base `ToolCallPart`.** The base type
(from `@tanstack/ai-client`, untyped tools) always carries `approval?`, so a
reusable component works across every tool regardless of the caller's tool
union — this is the [Approval UI Example](#approval-ui-example) below.

**3. Use an untyped `useChat()`.** With no `tools` generic, every tool-call
part keeps `approval?` exactly as before — no narrowing needed.

## Approval UI Example

Here's a more complete approval UI component:

```tsx
import type { ToolCallPart } from '@tanstack/ai-client'

function ApprovalPrompt({
  part,
  onApprove,
  onDeny,
}: {
  part: ToolCallPart
  onApprove: () => void
  onDeny: () => void
}) {
  // `part.input` is the parsed, fully-typed argument object — always populated
  // by approval time (the arguments are complete). The raw `part.arguments`
  // string is still available if you need it.
  const args = part.input

  return (
    <div className="border border-yellow-500 rounded-lg p-4 bg-yellow-50">
      <div className="font-semibold mb-2">
        🔒 Approval Required: {part.name}
      </div>
      <div className="text-sm text-gray-600 mb-4">
        <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="px-4 py-2 bg-green-600 text-white rounded-lg"
        >
          ✓ Approve
        </button>
        <button
          onClick={onDeny}
          className="px-4 py-2 bg-red-600 text-white rounded-lg"
        >
          ✗ Deny
        </button>
      </div>
    </div>
  )
}
```

Wire it up from your message renderer. Note the `id` you pass is the **approval id** (`part.approval.id`), not the tool call id:

```tsx ignore
{
  part.type === 'tool-call' &&
    part.state === 'approval-requested' &&
    part.approval && (
      <ApprovalPrompt
        part={part}
        onApprove={() =>
          addToolApprovalResponse({ id: part.approval!.id, approved: true })
        }
        onDeny={() =>
          addToolApprovalResponse({ id: part.approval!.id, approved: false })
        }
      />
    )
}
```

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

const { messages, addToolApprovalResponse } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  // Pass client tools as a plain array — literal tool-name inference works
  // without a wrapper, so `part.name === "delete_local_data"` still narrows
  // `part.input` / `part.output` to this tool's types.
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
