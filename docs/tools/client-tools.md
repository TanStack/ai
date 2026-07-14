---
title: Client Tools
id: client-tools
order: 4
description: "Client tools in TanStack AI run in the browser for UI updates, localStorage, and browser API access with automatic execution."
keywords:
  - tanstack ai
  - client tools
  - browser tools
  - ui tools
  - automatic execution
  - clientTools
  - localStorage
---

Client tools execute in the browser, enabling UI updates, local storage access, and browser API interactions. Unlike server tools, client tools don't have an `execute` function in their server definition.

```mermaid
sequenceDiagram
    participant LLM Service
    participant Server
    participant Browser
    participant ClientTool
    
    LLM Service->>Server: tool_call chunk<br/>{name: "updateUI", args: {...}}
    Server->>Server: Check if tool has<br/>server execute
    
    Note over Server: No execute function<br/>= client tool
    
    Server->>Browser: RUN_FINISHED client-tool<br/>interrupt via SSE/HTTP
    Browser->>Browser: Find registered<br/>client tool
    Browser->>ClientTool: execute(args)
    ClientTool->>ClientTool: Update UI,<br/>localStorage, etc.
    ClientTool-->>Browser: Return result
    Browser->>Server: POST tool result
    Server->>LLM Service: Add tool_result<br/>to conversation
    
    Note over LLM Service: Model uses result<br/>to continue
    
    LLM Service-->>Server: Stream response
    Server-->>Browser: Forward chunks
```

## When to Use Client Tools

- **UI Updates**: Show notifications, update forms, toggle visibility
- **Local Storage**: Save user preferences, cache data
- **Browser APIs**: Access geolocation, camera, clipboard
- **State Management**: Update React/Vue/Solid state
- **Navigation**: Change routes, scroll to sections

## How It Works

1. **Tool Call from LLM**: LLM decides to call a client tool
2. **Server Detection**: Server sees the tool has no `execute` function
3. **Client Notification**: Server emits a `client-tool-execution` AG-UI interrupt
4. **Client Execution**: The browser finds the registered `.client()` implementation by tool name and runs it with the parsed input
5. **Result Return**: Client executes the tool and returns the result
6. **Server Update**: Result is sent back to the server and added to the conversation
7. **LLM Continuation**: LLM receives the result and continues the conversation

Native client-tool execution uses the same atomic interrupt lifecycle as other
waits. See [Interrupts](../chat/interrupts) for persistence, batches, recovery,
and migration from the historical `tool-input-available` custom event.

## Approval and execution are separate axes

A client tool can require approval, but approval is not the browser result. A
tool with `needsApproval: true` first produces a `tool-approval` interrupt. Once
approved, its browser work is represented separately by a
`client-tool-execution` interrupt.

```ts ignore
const approval = interrupts.find(
  (interrupt) =>
    interrupt.kind === 'tool-approval' &&
    interrupt.toolName === 'delete_local_data',
)

if (
  approval?.kind === 'tool-approval' &&
  approval.toolName === 'delete_local_data'
) {
  approval.resolveInterrupt(true)
}

const execution = interrupts.find(
  (interrupt) =>
    interrupt.kind === 'client-tool-execution' &&
    interrupt.toolName === 'delete_local_data',
)

if (
  execution?.kind === 'client-tool-execution' &&
  execution.toolName === 'delete_local_data'
) {
  execution.resolveInterrupt({ deleted: true })
}
```

The result is validated against the tool's output schema. The existing
`addToolResult` API remains supported and delegates to the same staged native
item when one matches; it also preserves the historical path for legacy
streams. See [Tool approval flow](./tool-approval) for approval forms and
[Migrate to AG-UI interrupts](../migration/interrupts) for compatibility limits.

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
    message: z.string().meta({ description: "Message to display" }),
    type: z.enum(["success", "error", "info"]).meta({ description: "Message type" }),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
});

export const saveToLocalStorageDef = toolDefinition({
  name: "save_to_local_storage",
  description: "Save data to browser local storage",
  inputSchema: z.object({
    key: z.string().meta({ description: "Storage key" }),
    value: z.string().meta({ description: "Value to store" }),
  }),
  outputSchema: z.object({
    saved: z.boolean(),
  }),
});
```

## Using Client Tools

### Server-Side

To give the LLM access to client tools, pass the tool definitions (not implementations) to the server when creating the chat:

```typescript
// api/chat/route.ts
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { updateUIDef, saveToLocalStorageDef } from "./tools/definitions";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [updateUIDef, saveToLocalStorageDef], // Pass definitions
  });

  return toServerSentEventsResponse(stream);
}
```

> **Security:** registering the definitions statically (as above) is the safe
> default — the server alone decides which tools the model sees, so a client
> can't advertise tools you didn't sanction. If you'd instead like the client
> to declare its tools per request via AG-UI `RunAgentInput.tools`, use
> [`mergeAgentTools`](../migration/ag-ui-compliance#tier-3--optional-let-the-client-advertise-its-tools) —
> read its security note first, since `params.tools` is client-controlled.

### Client-Side

Create client implementations with automatic execution and full type safety:

```tsx
// app/chat.tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { 
  createChatClientOptions, 
  type InferChatMessages,
  type ToolCallPart,
  type MessagePart,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const updateUIDef = toolDefinition({
  name: "update_ui",
  description: "Update the UI with new information",
  inputSchema: z.object({
    message: z.string().meta({ description: "Message to display" }),
    type: z.enum(["success", "error", "info"]).meta({ description: "Message type" }),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

const saveToLocalStorageDef = toolDefinition({
  name: "save_to_local_storage",
  description: "Save data to browser local storage",
  inputSchema: z.object({
    key: z.string().meta({ description: "Storage key" }),
    value: z.string().meta({ description: "Value to store" }),
  }),
  outputSchema: z.object({ saved: z.boolean() }),
});

// Step 1: Create client implementations (module scope)
const updateUI = updateUIDef.client((input) => {
  // Update UI state - fully typed!
  console.log(input.message, input.type);
  return { success: true };
});

const saveToLocalStorage = saveToLocalStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

// Step 2: A plain array is all you need — literal tool names, inputs and
// outputs are inferred without any wrapper or `as const`.
const tools = [updateUI, saveToLocalStorage];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Step 3: Infer message types for full type safety
type ChatMessages = InferChatMessages<typeof chatOptions>;

function ChatComponent() {
  const { messages, sendMessage, isLoading } = useChat(chatOptions);

  // Step 4: Render with full type safety
  return (
    <div>
      {messages.map((message) => (
        <MessageComponent key={message.id} message={message} />
      ))}
    </div>
  );
}

// Messages component with full type safety
function MessageComponent({ message }: { message: ChatMessages[number] }) {
  return (
    <div>
      {message.parts.map((part: MessagePart) => {
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
        return null;
      })}
    </div>
  );
}
```

## Automatic Execution

Client tools are **automatically executed** when the model calls them. The flow is:

1. LLM calls a client tool
2. Server sends a `client-tool-execution` interrupt to the browser
3. Client automatically executes the matching tool implementation
4. Result is sent back to server
5. Conversation continues with the result

## Client Runtime Context

Client tools can receive typed runtime context as their second argument. This context is local to the `ChatClient` or framework hook instance and is not serialized to the server.

```typescript
import { createChatClientOptions } from "@tanstack/ai-client";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { toolDefinition } from "@tanstack/ai";
import { toast } from "./toast";

const activeProjectId = "";

type ClientContext = {
  activeProjectId: string;
  toast(message: string): void;
};

const showToast = toolDefinition({
  name: "show_toast",
  description: "Show a browser notification",
}).client<ClientContext>((_input, ctx) => {
  ctx.context.toast(`Project ${ctx.context.activeProjectId} updated`);
  return { ok: true };
});

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [showToast],
  context: {
    activeProjectId,
    toast: (message) => toast(message),
  },
});

const chat = useChat(chatOptions);
```

Use `context` for local browser dependencies. If the server also needs a value from the client, send it with `forwardedProps`, validate it in your route, and map it into server `chat({ context })` explicitly. See [Runtime Context](../advanced/runtime-context) for the full pattern.

## The `clientTools()` helper (optional)

Passing a plain array — `tools: [toolA, toolB]` — is all you need: tool names, inputs and outputs are inferred without any wrapper and without `as const`. `clientTools()` is an optional identity helper that performs the same capture explicitly. Reach for it only when you want to build a shared, reusable tools tuple **outside** the hook/options call:

```ts
import { clientTools } from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";

const notify = toolDefinition({
  name: "notify",
  description: "Show a notification",
}).client(() => ({ ok: true }));

// Equivalent to `const tools = [notify]` — just captured explicitly.
const tools = clientTools(notify);
```

## Type Safety Benefits

The isomorphic architecture provides complete end-to-end type safety:

```typescript
import type { UIMessage } from "@tanstack/ai-client";

const messages: UIMessage[] = [];

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

A `tool-call` part moves through a small set of observable `ToolCallState` values you can surface in the UI to indicate progress:

- `awaiting-input` — the model intends to call the tool but arguments haven't arrived yet.
- `input-streaming` — the model is streaming the tool arguments (partial input may be available).
- `input-complete` — all arguments have been received and the tool can run.
- `approval-requested` — the tool is waiting for user approval before it can run.
- `approval-responded` — the user has approved or denied the tool call.

The `ToolCallState` union includes a `complete` value, but the runtime never transitions a tool-call part to it — a finished call settles at `input-complete`. Once the tool runs, the result appears two ways: `part.output` becomes populated on the tool-call part, and a sibling `tool-result` part is emitted whose own `state` is `complete` or `error` (the `error` case carries `part.error`). Use the tool-call states for loading/streaming progress and the tool-result part for final success/error feedback.

```tsx
import type { ToolCallPart } from "@tanstack/ai-client";

function ToolCallDisplay({ part }: { part: ToolCallPart }) {
  if (part.state === "awaiting-input") {
    return <div>🔄 Waiting for arguments...</div>;
  }
  
  if (part.state === "input-streaming") {
    return <div>📥 Receiving arguments...</div>;
  }
  
  if (part.state === "input-complete") {
    return <div>✓ Arguments received, running tool...</div>;
  }

  // Completion shows up as a populated `part.output` (and as a sibling
  // `tool-result` part whose state is `complete` / `error`).
  if (part.output) {
    return <div>✅ Tool complete</div>;
  }
  
  return null;
}
```

## Hybrid Tools

Tools can be implemented for both server and client, enabling flexible execution:

```typescript
import { toolDefinition, chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";
import { db } from "./db";

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
chat({ adapter: openaiText('gpt-5.5'), messages: [], tools: [addToCartDef] }); // Client will execute

// Or pass server implementation for server execution
chat({ adapter: openaiText('gpt-5.5'), messages: [], tools: [addToCartServer] }); // Server will execute
```

## Best Practices

- **Keep client tools simple** - Since client tools run in the browser, avoid heavy computations or large dependencies that could bloat your bundle size.
- **Handle errors gracefully** - Define clear error handling in your tool implementations and return meaningful error messages in your output schema.
- **Update UI reactively** - Use your framework's state management (eg. React/Vue/Solid) to update the UI in response to tool executions.
- **Secure sensitive data** - Never store sensitive data (like API keys or personal info) in local storage or expose it via client tools.
- **Provide feedback** - Use tool states to inform users about ongoing operations and results of client tool executions (loading spinners, success messages, error alerts).
- **Type everything** - Leverage TypeScript and Zod schemas for full type safety from tool definitions to implementations to usage.

## Common Use Cases

- **UI Updates** - Show notifications, update forms, toggle visibility
- **Local Storage** - Save user preferences, cache data
- **Browser APIs** - Access geolocation, camera, clipboard
- **State Management** - Update React/Vue/Solid state
- **Navigation** - Change routes, scroll to sections
- **Analytics** - Track user interactions

## Next Steps

- [How Tools Work](./tool-architecture) - Deep dive into the tool architecture
- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Tool Approval Flow](./tool-approval) - Add approval workflows for sensitive operations
