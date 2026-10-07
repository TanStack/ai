---
title: Tools
id: tools
order: 1
description: "Define isomorphic AI tools in TanStack AI with toolDefinition() for type-safe server- and client-side function calling across any framework."
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

Tools (also called "function calling") allow AI models to interact with external systems, APIs, or perform computations. TanStack AI provides an isomorphic tool system that enables type-safe, framework-agnostic tool definitions that work on both server and client.

Tools enable your AI application to:

- **Fetch data** from APIs or databases
- **Perform calculations** or data transformations
- **Interact with services** like email, calendars, or payment systems
- **Execute client-side operations** like updating UI or local storage
- **Create hybrid tools** that execute in both server and client contexts

> Looking for provider-native tools like Anthropic web search, OpenAI code
> interpreter, or Gemini URL context? See [Provider Tools](./provider-tools.md).

## Framework Support

TanStack AI works with **any** JavaScript framework:
- TanStack Start, Next.js, Express, Remix, Fastify, etc.
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
- **Schema Options**: Use Zod schemas or raw JSON Schema objects

## Schema Options

TanStack AI supports two ways to define tool schemas:

### Option 1: Zod Schemas (Recommended)

Zod schemas provide full TypeScript type inference and runtime validation:

```typescript
import { z } from "zod";

const inputSchema = z.object({
  location: z.string().meta({ description: "City name" }),
  unit: z.enum(["celsius", "fahrenheit"]).optional(),
});
```

> **Note:** For OpenAI-compatible providers, an omitted `.optional()` tool field is absent when your tool runs. A `.nullable()` field keeps `null`.

### Option 2: JSON Schema Objects

For cases where you already have JSON Schema definitions or prefer not to use Zod, you can pass raw JSON Schema objects directly:

```typescript
import type { JSONSchema } from "@tanstack/ai";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    location: {
      type: "string",
      description: "City name",
    },
    unit: {
      type: "string",
      enum: ["celsius", "fahrenheit"],
    },
  },
  required: ["location"],
};
```

> **Note:** JSON Schema input and output types are `unknown`. Narrow the values before use. Standard Schema libraries such as Zod provide inferred types.

### Validate input before execution

A model can send arguments that do not match your tool. `chat()` validates the final input after `onBeforeToolCall` middleware. Invalid input becomes a tool error that the model can read. The tool does not execute.

Raw JSON Schema input uses schema-guided coercion. For example, a number field can accept `"5"` and pass `5` to the tool. Missing required fields and values that still fail the schema produce an error.

```typescript
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const double = toolDefinition({
  name: 'double',
  description: 'Double a number',
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'number' } },
    required: ['value'],
    additionalProperties: false,
  },
}).server((input) => {
  if (
    typeof input !== 'object' || input === null ||
    !('value' in input) || typeof input.value !== 'number'
  ) {
    throw new Error('Expected a number in value')
  }
  return input.value * 2
})

for await (const chunk of chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Double 5 with the double tool' }],
  tools: [double],
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') console.log(chunk.delta)
}
```

Standard Schema validates the authored input first and preserves its transformed output. If that fails, coercion needs a safe Standard JSON Schema **input** export. The converted value must then pass the authored validator. Without that export, the original validation error is returned.

Each accepted execution boundary uses one successful authored transform. A failed first check can still require a second authored check after coercion.

The execution input can differ from the provider's raw JSON. Validation and middleware do not rewrite the provider's saved arguments. A human's approved argument edit can update history. See [Tool Approval](../interrupts/tool-approval).

Empty or whitespace-only arguments fail for a tool with an input schema. Valid JSON values such as `null`, arrays, and numbers are checked against that schema. Malformed JSON produces a tool error.

> **Tip:** Type safety from Zod schemas extends beyond tool execution. When you pass `.client()` tools to `useChat`, a check on `part.name` narrows `part.input` and `part.output`. See [Type-safe tool call events](../chat/stream-events#type-safe-tool-call-events).

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
    location: z.string().meta({ description: "The city and state, e.g. San Francisco, CA" }),
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

### Using JSON Schema

If you prefer JSON Schema or have existing schema definitions:

```typescript group=json-schema-tools
import { toolDefinition } from "@tanstack/ai";
import type { JSONSchema } from "@tanstack/ai";

// Define schemas using JSON Schema
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

// Create the tool definition
const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather for a location",
  inputSchema,
  outputSchema,
});

// With a raw JSON Schema, `args` is `unknown`. Narrow it before use
// (prefer a Zod schema for automatic typing).
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

## Using Tools in Chat

### Server-Side

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

  // Create server implementation
  const getWeather = getWeatherDef.server(async ({ location, unit }) => {
    const response = await fetch(`https://api.weather.com/v1/current?...`);
    return await response.json();
  });

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [getWeather], // Pass server tools
  });

  return toServerSentEventsResponse(stream);
}
```

### Client-Side with Type Safety

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { 
  createChatClientOptions, 
  type InferChatMessages 
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

// Create client implementations
const updateUI = updateUIDef.client((input) => {
  // Update UI state
  console.log(input.message);
  return { success: true };
});

const saveToStorage = saveToStorageDef.client((input) => {
  localStorage.setItem(input.key, input.value);
  return { saved: true };
});

// Create typed tools array (no 'as const' needed!)
const tools = [updateUI, saveToStorage];

const textOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Infer message types for full type safety
type ChatMessages = InferChatMessages<typeof textOptions>;

function ChatComponent() {
  const { messages } = useChat(textOptions);
  
  // messages is now fully typed with tool names and outputs!
  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.role}</div>
      ))}
    </div>
  );
}
```

## Hybrid Tools

Tools can be implemented for both server and client, enabling flexible execution patterns:

```typescript group=tools
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

On the server, pass either the definition (for client execution) or the server implementation, in separate `chat()` calls:

```typescript group=tools
const messages = [{ role: 'user' as const, content: 'Add item abc to my cart' }]

// Pass the definition: the client will execute the tool
chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [addToCartDef],
});

// Or pass the server implementation: the server will execute the tool
chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [addToCartServer],
});
```

## Type Safety Benefits

The isomorphic architecture provides complete type safety:

```tsx
import { useChat } from "@tanstack/ai-react";
import { fetchServerSentEvents } from "@tanstack/ai-client";

function CartChat() {
  const { messages: uiMessages } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  // In your React component
  uiMessages.forEach((message) => {
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

  return null;
}
```

## Tool Execution Flow

1. **Model decides to call a tool** - Based on user input and tool descriptions
2. **Tool is identified** - Server or client implementation
3. **Tool executes** - Automatically on server or client
4. **Result is returned** - To the model as a tool result message
5. **Model continues** - Uses the result to generate a response

## Run tools one at a time

When the model calls several server tools in one turn, they start at the same time, and the model gets the results in the order of its calls. Some tools must not overlap, for example a tool that writes a file and a tool that runs the tests.

Set `toolExecution: 'sequential'` on `chat()` to run the tools of each turn one at a time, in call order:

```ts
import { chat, toolDefinition } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const writeFile = toolDefinition({
  name: 'write_file',
  description: 'Write a file',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
}).server(async ({ path }) => ({ written: path }))

const runTests = toolDefinition({
  name: 'run_tests',
  description: 'Run the test suite',
  inputSchema: z.object({}),
}).server(async () => ({ passed: true }))

const stream = chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Fix the bug, then run the tests.' }],
  tools: [writeFile, runTests],
  toolExecution: 'sequential',
})
```

Client tools do not change: the client runs them as their calls arrive.

## Choose when the model calls a tool

By default, the model decides to call a tool or not. Sometimes a tool call must come first, for example a weather lookup before the model gives advice. Sometimes the model must answer in text. `toolChoice` sets this for a model call.

`toolChoice` on `chat()` applies to every model call of the run. With `'required'` or a named tool, the model calls a tool on each call and never writes a text answer. The run then stops at the loop limit, after a tool result. Use a forced value in one of these two ways.

**Force a tool on the first call only.** Return `toolChoice` from a middleware:

```ts group=tool-choice
import { chat, toolDefinition, type ChatMiddleware } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, temperature: 21 }))

const weatherFirst: ChatMiddleware = {
  name: 'weather-first',
  onConfig: (ctx) => {
    if (ctx.phase === 'beforeModel' && ctx.iteration === 0) {
      return { toolChoice: { type: 'tool', name: 'get_weather' } }
    }
  },
}

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'What should I wear in Paris today?' }],
  tools: [getWeather],
  middleware: [weatherFirst],
})
```

The first call must call `get_weather`. A value from middleware applies to that call only, so the next call uses the `chat()` option again. Here that is the provider default, and the model answers with the forecast.

**Run one step only.** Set `agentLoopStrategy: maxIterations(1)`. The model makes one call, the tool runs, and the run ends:

```ts group=tool-choice
import { maxIterations } from '@tanstack/ai'

const oneLookup = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Weather in Oslo?' }],
  tools: [getWeather],
  toolChoice: 'required',
  agentLoopStrategy: maxIterations(1),
})
```

To end a run with a text answer, return `{ toolChoice: 'none' }` on its last call. See [Change the tool choice of a call](../advanced/middleware#change-the-tool-choice-of-a-call).

The values:

| Value | What the model does |
| --- | --- |
| `'auto'` | It decides. |
| `'none'` | It calls no tool. |
| `'required'` | It must call a tool. |
| `{ type: 'tool', name }` | It must call the tool with this name. |

The rules for every adapter:

- If the request has no tools, the adapter sends no tool choice.
- A provider tool choice in `modelOptions` wins over `toolChoice`, for example `tool_choice` on OpenAI.
- The adapter sends the name in `{ type: 'tool', name }` as you give it. It does not check that a tool has this name.

### Provider notes

Some providers change or ignore some values:

- **OpenAI, Grok, Groq, Mistral, OpenRouter, and the other OpenAI-compatible adapters**: the adapter sends the value as the provider tool choice.
- **Anthropic**: if the request cannot force a tool, `'required'` and a named tool become `'auto'`.
  - `claude-fable-5-1`, `claude-opus-5-5`, and `claude-sonnet-5-5` never take a forced tool.
  - No Claude model takes a forced tool while thinking is on.
- **Amazon Bedrock (Converse API)**:
  - The Anthropic rule applies to the Claude models, and also to `claude-mythos-5-1`.
  - Converse has no `none` value, so `'none'` sends no tools.
  - After a tool call in the history, Bedrock needs the tools. Then `'none'` sends them with `auto`, and the model can still call a tool.
  - A request with no tools sends the tool calls and tool results of the history as text.
  - AWS documents a named tool for Claude and Nova models only.
- **Gemini**: the value becomes `functionCallingConfig`.
  - The modes are `AUTO`, `NONE`, and `ANY`. A named tool is `ANY` with `allowedFunctionNames`.
  - With only provider tools, such as Google Search, Gemini gets no tool config.
- **Ollama**: Ollama has no tool choice, so the adapter ignores `toolChoice`. See [Ollama](../adapters/ollama#tool-choice).

## Progress Events and Runtime Context

A server tool's `.server()` implementation receives a second argument, the `ToolExecutionContext`: `{ context, toolCallId, emitCustomEvent }`. Use `emitCustomEvent` to stream typed progress to the client while the tool runs, and `context` to read request-scoped dependencies (auth, DB clients, etc.):

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

Each `emitCustomEvent` call flushes through durability immediately, so the
client can show progress while the tool still runs. Pass `{ batch: true }`
only for a high-volume stream. See [Custom Events](../protocol/custom-events).

See [Server Tools](./server-tools) for the full runtime-context pattern.

## Tool States

Tools go through different states during execution:

- `awaiting-input` - Tool call received, waiting for arguments
- `input-streaming` - Partial arguments being streamed
- `input-complete` - All arguments received
- `approval-requested` - Tool requires user approval (if `needsApproval: true`)
- `approval-responded` - User has approved/denied

Once arguments (and approval, if required) are in, the result appears as `part.output` on the tool-call part and as a separate sibling `tool-result` part whose `state` is `complete` or `error`. See [Tool Architecture](./tool-architecture) for the full state model.

> **Tip:** If your use case involves calling multiple tools with complex logic (filtering, aggregation, parallel calls), consider [Code Mode](../code-mode/code-mode). It lets the LLM write a TypeScript program that orchestrates tools in a single execution instead of one tool call at a time.

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Client Tools](./client-tools) - Learn about client-side tool execution
- [Tool Approval Flow](./tool-approval) - Implement approval workflows
- [How Tools Work](./tool-architecture) - Deep dive into the tool architecture
- [MCP Server Tools](./mcp) - Connect to external MCP servers for additional tools
