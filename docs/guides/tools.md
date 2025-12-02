# Tools

Tools (also called "function calling") allow AI models to interact with external systems, APIs, or perform computations. TanStack AI provides an isomorphic tool system that enables type-safe, framework-agnostic tool definitions that work on both server and client.

## Overview

Tools enable your AI application to:

- **Fetch data** from APIs or databases
- **Perform calculations** or data transformations
- **Interact with services** like email, calendars, or payment systems
- **Execute client-side operations** like updating UI or local storage
- **Create hybrid tools** that execute in both server and client contexts

## Framework Support

TanStack AI works with **any** JavaScript framework:
- Next.js, Express, Remix, Fastify, etc.
- React, Vue, Solid, Svelte, vanilla JS, etc.

TanStack AI works with any JavaScript framework.

## Isomorphic Tool Architecture

TanStack AI uses a two-step tool definition process:

1. **Define once** with `toolDefinition()` - Creates a shared tool schema
2. **Implement** with `.server()` or `.client()` - Add execution logic for each environment

This approach provides:

- **Type Safety**: Full TypeScript inference from Zod schemas
- **Code Reuse**: Define schemas once, use everywhere
- **Flexibility**: Tools can execute on server, client, or both


## Tool Definition

Tools are defined using `toolDefinition()` from `@tanstack/ai`:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// Step 1: Define the tool schema
const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
});

// Step 2: Create a server implementation
const getWeatherServer = getWeatherDef.server(async ({ location, unit }) => {
  const response = await fetch(
    `https://api.weather.com/v1/current?location=${location}&unit=${
      unit || "fahrenheit"
    }`
  );
  const data = await response.json();
  return {
    temperature: data.temperature,
    conditions: data.conditions,
    location: data.location,
  };
});
```

## Using Tools in Chat

### Server-Side

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { getWeatherDef } from "./tools";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Create server implementation
  const getWeather = getWeatherDef.server(async ({ location, unit }) => {
    const response = await fetch(`https://api.weather.com/v1/current?...`);
    return await response.json();
  });

  const stream = chat({
    adapter: openai(),
    messages,
    model: "gpt-4o",
    tools: [getWeather], // Pass server tools
  });

  return toStreamResponse(stream);
}
```

### Client-Side with Type Safety

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { updateUIDef, saveToStorageDef } from "./tools";

// Create client implementations
const updateUI = updateUIDef.client((input) => {
  // Update UI state
  setNotification(input.message);
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem("data", JSON.stringify(input));
  return { saved: true };
});

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(updateUI, saveToStorage);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Infer message types for full type safety
type ChatMessages = InferChatMessages<typeof chatOptions>;

function ChatComponent() {
  const { messages, sendMessage } = useChat(chatOptions);
  
  // messages is now fully typed with tool names and outputs!
  return <Messages messages={messages} />;
}
```

## Hybrid Tools

Tools can be implemented for both server and client, enabling flexible execution patterns:

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
  needsApproval: true,
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
```

On the server, pass the definition (for client execution) or server implementation:

```typescript
chat({
  adapter: openai(),
  messages,
  tools: [addToCartDef], // Client will execute, or
  tools: [addToCartServer], // Server will execute
});
```

## Type Safety Benefits

The isomorphic architecture provides complete type safety:

```typescript
// In your React component
messages.forEach((message) => {
  message.parts.forEach((part) => {
    if (part.type === 'tool-call' && part.name === 'add_to_cart') {
      // ✅ TypeScript knows part.name is literally 'add_to_cart'
      // ✅ part.input is typed as { itemId: string, quantity: number }
      // ✅ part.output is typed as { success: boolean, cartId: string } | undefined
      
      if (part.output) {
        console.log(part.output.cartId); // ✅ Fully typed!
      }
    }
  });
});
```

## Tool Execution Flow

1. **Model decides to call a tool** - Based on user input and tool descriptions
2. **Tool is identified** - Server or client implementation
3. **Tool executes** - Automatically on server or client
4. **Result is returned** - To the model as a tool result message
5. **Model continues** - Uses the result to generate a response

## Tool States

Tools go through different states during execution:

- `awaiting-input` - Tool call received, waiting for arguments
- `input-streaming` - Partial arguments being streamed
- `input-complete` - All arguments received
- `approval-requested` - Tool requires user approval (if `needsApproval: true`)
- `approval-responded` - User has approved/denied

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Client Tools](./client-tools) - Learn about client-side tool execution
- [Tool Approval Flow](./tool-approval) - Implement approval workflows
- [How Tools Work](./how-tools-work) - Deep dive into the tool architecture
