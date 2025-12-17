---
title: Tool Approval Flow
id: tool-approval-flow
order: 5
---

The tool approval flow allows you to require user approval before executing sensitive tools, giving users control over actions like sending emails, making purchases, or deleting data. Tools go through these states during approval:

1. **`approval-requested`** - Waiting for user approval
2. **`executing`** - Approved, now executing
3. **`output-available`** - Execution completed
4. **`output-error`** - Execution failed
5. **`cancelled`** - User denied approval

When a tool requires approval, the typical flow is:

1. Model calls the tool
2. Tool execution is paused
3. User is prompted to approve or deny
4. Tool executes (if approved) or is cancelled (if denied)
5. Conversation continues with the result

## Enabling Approval

Tools can be marked as requiring approval by setting `needsApproval: true` in the definition:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// Step 1: Define tool with approval requirement
const sendEmailDef = toolDefinition({
  name: "send_email",
  description: "Send an email to a recipient",
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
});

// Step 2: Create server implementation
const sendEmail = sendEmailDef.server(async ({ to, subject, body }) => {
  // Only executes if approved
  await emailService.send({ to, subject, body });
  return { success: true, messageId: "..." };
});
```

## Server-Side Approval

On the server, tools with `needsApproval: true` will pause execution and wait for approval:

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { sendEmail } from "./tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-4o"),
    messages,
    tools: [sendEmail],
  });

  return toStreamResponse(stream);
}
```

## Client-Side Approval Handling

The client receives approval requests and can respond:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function ChatComponent() {
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => {
            // Check for approval requests
            if (
              part.type === "tool-call" &&
              part.state === "approval-requested" &&
              part.approval
            ) {
              return (
                <div key={part.id} className="approval-prompt">
                  <p>Approve: {part.name}</p>
                  <pre>{JSON.stringify(part.arguments, null, 2)}</pre>
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
              );
            }
            // ... render other parts
          })}
        </div>
      ))}
    </div>
  );
}
```

## Approval UI Example

Here's a more complete approval UI component:

```typescript
function ApprovalPrompt({ part, onApprove, onDeny }) {
  const args = JSON.parse(part.arguments);

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
  );
}
```

## Client Tools with Approval

Client tools can also require approval:

```typescript
// tools/definitions.ts
const deleteLocalDataDef = toolDefinition({
  name: "delete_local_data",
  description: "Delete data from local storage",
  inputSchema: z.object({
    key: z.string(),
  }),
  outputSchema: z.object({
    deleted: z.boolean(),
  }),
  needsApproval: true, // Requires approval even on client
});

// Client: Create implementation
const deleteLocalData = deleteLocalDataDef.client((input) => {
  // This will only execute after approval
  localStorage.removeItem(input.key);
  return { deleted: true };
});

const { messages, addToolApprovalResponse } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [deleteLocalData], // Automatic execution after approval
});
```

## Example: E-commerce Purchase

```typescript
// Define tool with approval requirement
const purchaseItemDef = toolDefinition({
  name: "purchase_item",
  description: "Purchase an item from the store",
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
});

// Create server implementation
const purchaseItem = purchaseItemDef.server(async ({ itemId, quantity, price }) => {
  const order = await createOrder({ itemId, quantity, price });
  return { orderId: order.id, total: price * quantity };
});
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
