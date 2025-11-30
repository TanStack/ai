# Client Tools

Client tools execute in the browser, allowing you to interact with the UI, local storage, and browser APIs with full type safety.

## Defining Client Tools

Client tools use the same `toolDefinition()` API but with the `.client()` method:

```typescript
// tools/definitions.ts - Shared between server and client
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const updateUIDef = toolDefinition({
  name: "update_ui",
  description: "Update the UI with new information",
  inputSchema: z.object({
    message: z.string().describe("Message to display"),
    type: z.enum(["success", "error", "info"]).describe("Message type"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const saveToLocalStorageDef = toolDefinition({
  name: "save_to_local_storage",
  description: "Save data to browser local storage",
  inputSchema: z.object({
    key: z.string().describe("Storage key"),
    value: z.string().describe("Value to store"),
  }),
  outputSchema: z.object({
    saved: z.boolean(),
  }),
});
```

## Using Client Tools

### Server-Side

Pass tool definitions (not implementations) to the server so the LLM knows about them:

```typescript
// api/chat/route.ts
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { updateUIDef, saveToLocalStorageDef } from "@/tools/definitions";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    messages,
    model: "gpt-4o",
    tools: [updateUIDef, saveToLocalStorageDef], // Pass definitions
  });

  return toServerSentEventsStream(stream);
}
```

### Client-Side

Create client implementations with automatic execution and full type safety:

```typescript
// app/chat.tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { createChatClientOptions, type InferChatMessages } from "@tanstack/ai-client";
import { updateUIDef, saveToLocalStorageDef } from "@/tools/definitions";
import { useState } from "react";

function ChatComponent() {
  const [notification, setNotification] = useState(null);

  // Step 1: Create client implementations
  const updateUI = updateUIDef.client((input) => {
    // Update React state - fully typed!
    setNotification({ message: input.message, type: input.type });
    return { success: true };
  });

  const saveToLocalStorage = saveToLocalStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  // Step 2: Create typed chat options
  const clientTools = [updateUI, saveToLocalStorage] as const;

  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools: clientTools,
  });

  // Step 3: Infer message types for full type safety
  type ChatMessages = InferChatMessages<typeof chatOptions>;

  const { messages, sendMessage, isLoading } = useChat(chatOptions);

  // Step 4: Render with full type safety
  return (
    <div>
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

// Messages component with full type safety
function MessageComponent({ message }: { message: ChatMessages[number] }) {
  return (
    <div>
      {message.parts.map((part) => {
        if (part.type === "text") {
          return <p>{part.content}</p>;
        }
        
        if (part.type === "tool-call") {
          // ✅ part.name is narrowed to specific tool names
          if (part.name === "update_ui") {
            // ✅ part.input is typed as { message: string, type: "success" | "error" | "info" }
            // ✅ part.output is typed as { success: boolean } | undefined
            return (
              <div>
                Tool: {part.name}
                {part.output && <span>✓ Success</span>}
              </div>
            );
          }
        }
      })}
    </div>
  );
}
```

## Automatic Execution

Client tools are **automatically executed** when the model calls them. No manual `onToolCall` callback needed!

1. LLM calls a client tool
2. Server sends `tool-input-available` chunk to browser
3. Client automatically executes the matching tool implementation
4. Result is sent back to server
5. Conversation continues with the result

## Type Safety Benefits

The isomorphic architecture provides complete end-to-end type safety:

```typescript
messages.forEach((message) => {
  message.parts.forEach((part) => {
    if (part.type === "tool-call" && part.name === "update_ui") {
      // ✅ TypeScript knows part.name is literally "update_ui"
      // ✅ part.input is typed as { message: string, type: "success" | "error" | "info" }
      // ✅ part.output is typed as { success: boolean } | undefined
      
      console.log(part.input.message); // ✅ Fully typed!
      
      if (part.output) {
        console.log(part.output.success); // ✅ Fully typed!
      }
    }
  });
});
```

## Tool States

Client tools go through different states that you can observe in the UI:

```typescript
function ToolCallDisplay({ part }: { part: ToolCallPart }) {
  if (part.state === "awaiting-input") {
    return <div>🔄 Waiting for arguments...</div>;
  }
  
  if (part.state === "input-streaming") {
    return <div>📥 Receiving arguments...</div>;
  }
  
  if (part.state === "input-complete") {
    return <div>✓ Arguments received, executing...</div>;
  }
  
  if (part.output) {
    return <div>✅ Tool completed successfully</div>;
  }
  
  return null;
}
```

## Hybrid Tools

Tools can be implemented for both server and client, enabling flexible execution:

```typescript
// Define once
const addToCartDef = toolDefinition({
  name: "add_to_cart",
  description: "Add item to shopping cart",
  inputSchema: z.object({
    itemId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
  }),
});

// Server implementation - Store in database
const addToCartServer = addToCartDef.server(async (input) => {
  const cart = await db.carts.create({
    data: { itemId: input.itemId, quantity: input.quantity },
  });
  return { success: true, cartId: cart.id };
});

// Client implementation - Update local wishlist
const addToCartClient = addToCartDef.client((input) => {
  const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
  wishlist.push(input.itemId);
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  return { success: true, cartId: "local" };
});

// Server: Pass definition for client execution
chat({ tools: [addToCartDef] }); // Client will execute

// Or pass server implementation for server execution
chat({ tools: [addToCartServer] }); // Server will execute
```

## Best Practices

1. **Keep client tools simple** - They run in the browser, so avoid heavy computations
2. **Handle errors gracefully** - Return meaningful error messages in your output schema
3. **Update UI reactively** - Use React/Vue/Solid state updates for UI changes
4. **Secure sensitive data** - Never store sensitive data in local storage
5. **Provide feedback** - Use tool states to show loading/success/error UI
6. **Type everything** - Use Zod schemas for complete type safety

## Common Use Cases

- **UI Updates** - Show notifications, update forms, toggle visibility
- **Local Storage** - Save user preferences, cache data
- **Browser APIs** - Access geolocation, camera, clipboard
- **State Management** - Update React/Vue/Solid state
- **Navigation** - Change routes, scroll to sections
- **Analytics** - Track user interactions

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Tool Approval Flow](./tool-approval) - Add approval workflows for sensitive operations
- [How Tools Work](./how-tools-work) - Deep dive into the tool architecture
