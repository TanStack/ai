---
title: Tools
id: tools
order: 1
description: "Define isomorphic tools with toolDefinition() — Zod/JSON Schema, .server()/.client(), chat() wiring."
keywords:
  - tanstack ai
  - tools
  - function calling
  - toolDefinition
  - isomorphic tools
  - server tools
  - client tools
  - type safety
---

If the model must call your code (API, DB, UI) → define once with `toolDefinition()`, implement with `.server()` or `.client()`, pass to `chat()` / `useChat`.

Provider-native tools (web search, code interpreter, …): [Provider Tools](./provider-tools.md).

## Define a tool

1. Schema with `toolDefinition()`
2. Implement `.server()` and/or `.client()`

### Zod (recommended)

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().meta({ description: "The city and state, e.g. San Francisco, CA" }),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
});

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

### JSON Schema

Input/output types infer as `unknown` — narrow before use:

```typescript group=json-schema-tools
import { toolDefinition } from "@tanstack/ai";
import type { JSONSchema } from "@tanstack/ai";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    location: {
      type: "string",
      description: "The city and state, e.g. San Francisco, CA",
    },
    unit: {
      type: "string",
      enum: ["celsius", "fahrenheit"],
    },
  },
  required: ["location"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    temperature: { type: "number" },
    conditions: { type: "string" },
    location: { type: "string" },
  },
  required: ["temperature", "conditions", "location"],
};

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema,
  outputSchema,
});

const getWeatherServer = getWeatherDef.server(async (args) => {
  if (typeof args !== "object" || args === null || !("location" in args)) {
    throw new Error("Invalid input: expected a location");
  }
  const location = String(args.location);
  const unit = "unit" in args ? String(args.unit) : "fahrenheit";
  const response = await fetch(
    `https://api.weather.com/v1/current?location=${location}&unit=${unit}`
  );
  return await response.json();
});
```

> Stream tool-call events are typed when tools use Zod — see [Type-Safe Tool Call Events](../chat/streaming#type-safe-tool-call-events).

## Use in chat

### Server

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().meta({ description: "The city and state, e.g. San Francisco, CA" }),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const getWeather = getWeatherDef.server(async ({ location, unit }) => {
    const response = await fetch(`https://api.weather.com/v1/current?...`);
    return await response.json();
  });

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

### Client (typed messages)

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Update the UI with a notification message",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ success: z.boolean() }),
});

const saveToStorageDef = toolDefinition({
  name: "saveToStorage",
  description: "Save data to storage",
  inputSchema: z.object({ key: z.string(), value: z.string() }),
  outputSchema: z.object({ saved: z.boolean() }),
});

const updateUI = updateUIDef.client((input) => {
  console.log(input.message);
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

const tools = [updateUI, saveToStorage];

const textOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type ChatMessages = InferChatMessages<typeof textOptions>;

function ChatComponent() {
  const { messages } = useChat(textOptions);

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.role}</div>
      ))}
    </div>
  );
}
```

## Hybrid tools

Same definition; pass definition (client runs) or `.server()` impl (server runs):

```typescript group=tools
import { toolDefinition, chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";
import { db } from "./db";

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

const addToCartServer = addToCartDef.server(async (input) => {
  const cart = await db.carts.create({
    data: { itemId: input.itemId, quantity: input.quantity },
  });
  return { success: true, cartId: cart.id };
});

const addToCartClient = addToCartDef.client((input) => {
  const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
  wishlist.push(input.itemId);
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  return { success: true, cartId: "local" };
});
```

```typescript group=tools
const messages = [{ role: 'user' as const, content: 'Add item abc to my cart' }]

// Definition only → client executes
chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [addToCartDef],
});

// Server impl → server executes
chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [addToCartServer],
});
```

With tools wired into `useChat`, `part.name` / `part.input` / `part.output` narrow:

```tsx
import { useChat } from "@tanstack/ai-react";
import { fetchServerSentEvents } from "@tanstack/ai-client";

function CartChat() {
  const { messages: uiMessages } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  uiMessages.forEach((message) => {
    message.parts.forEach((part) => {
      if (part.type === 'tool-call' && part.name === 'add_to_cart') {
        if (part.output) {
          console.log(part.output.cartId);
        }
      }
    });
  });

  return null;
}
```

## Execution flow

1. Model decides to call a tool
2. Server or client implementation runs
3. Result returns as a tool result message
4. Model continues with the result

## Progress + runtime context

`.server()` second arg: `ToolExecutionContext` — `{ context, toolCallId, emitCustomEvent }`:

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

type ImportContext = {
  db: {
    read(source: string): Promise<unknown[]>;
    write(rows: unknown[]): Promise<void>;
  };
};

const importDataDef = toolDefinition({
  name: "import_data",
  description: "Import data from a source",
  inputSchema: z.object({ source: z.string() }),
  outputSchema: z.object({ imported: z.number() }),
});

const importData = importDataDef.server<ImportContext>(async (input, { context, emitCustomEvent }) => {
  emitCustomEvent("progress", { step: 1, total: 3 });
  const rows = await context.db.read(input.source);

  emitCustomEvent("progress", { step: 2, total: 3 });
  await context.db.write(rows);

  emitCustomEvent("progress", { step: 3, total: 3 });
  return { imported: rows.length };
});
```

Full pattern: [Server Tools](./server-tools).

## Call states

On the **`tool-call`** part (`part.state`):

| State | Meaning |
| --- | --- |
| `awaiting-input` | Call received, no args yet |
| `input-streaming` | Partial args |
| `input-complete` | Args ready |
| `approval-requested` | Waiting on user (`needsApproval`) |
| `approval-responded` | User decided |

Result lives on sibling **`tool-result`** (`complete` / `error`) and on `part.output`. Full model: [Tool Architecture](./tool-architecture).

> Many tools with complex orchestration? Prefer [Code Mode](../code-mode/code-mode).

## Next

- [Server Tools](./server-tools)
- [Client Tools](./client-tools)
- [Tool Approval Flow](./tool-approval)
- [How Tools Work](./tool-architecture)
- [MCP Server Tools](./mcp)
