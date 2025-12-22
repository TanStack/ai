---
title: "@tanstack/ai"
id: tanstack-ai-api
order: 1
---

The core AI library for TanStack AI.

## Installation

```bash
npm install @tanstack/ai
```

## Migration: `chat` → `text` + `agentLoop`

The `chat` function is being replaced by two focused functions:

| Old API | New API | Use Case |
|---------|---------|----------|
| `chat({ tools: [...] })` | `agentLoop({ ... })` | Agentic workflows with tool execution |
| `chat({ })` (no tools) | `text({ ... })` | Simple text generation |

Both new functions are currently exported as `experimental_text` and `experimental_agentLoop`.

### Why the change?

- **Clearer intent**: `text` is for simple generation, `agentLoop` is for agentic workflows
- **Simpler APIs**: Each function is focused on its use case
- **Better defaults**: No need to configure agent loop strategies for simple text generation

---

## `text(options)` (Experimental)

Simple text generation without tool support. Use this for straightforward chat completions and structured output.

```typescript
import { experimental_text as text } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// Streaming (default)
for await (const chunk of text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Tell me a joke" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}

// Non-streaming
const response = await text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "What is 2+2?" }],
  stream: false,
});

// Structured output
import { z } from "zod";
const person = await text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Generate a person" }],
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
  }),
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `AnyTextAdapter` | **Required.** The text adapter (e.g., `openaiText('gpt-4o')`) |
| `messages` | `ModelMessage[]` | Conversation messages |
| `systemPrompts` | `string[]` | System prompts to prepend |
| `temperature` | `number` | Randomness (0.0-2.0) |
| `topP` | `number` | Nucleus sampling parameter |
| `maxTokens` | `number` | Maximum tokens to generate |
| `metadata` | `Record<string, unknown>` | Request metadata |
| `modelOptions` | Provider-specific | Model-specific options |
| `abortController` | `AbortController` | For cancellation |
| `conversationId` | `string` | Tracking identifier |
| `outputSchema` | `StandardSchema` | For structured output |
| `stream` | `boolean` | Stream output (default: `true`) |

### Returns

- Default: `AsyncIterable<StreamChunk>` (streaming)
- With `stream: false`: `Promise<string>`
- With `outputSchema`: `Promise<InferSchemaType<TSchema>>`

---

## `agentLoop(options)` (Experimental)

Agentic text generation with automatic tool execution. Use this when you need the model to call tools and loop until completion.

```typescript
import { experimental_agentLoop as agentLoop, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// Streaming with tools
for await (const chunk of agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_result") {
    console.log("Tool result:", chunk.content);
  }
}

// Structured output with tools
import { z } from "zod";
const result = await agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Research the weather and summarize" }],
  tools: [weatherTool, searchTool],
  outputSchema: z.object({
    summary: z.string(),
    temperature: z.number(),
  }),
});

// With agent loop strategy
for await (const chunk of agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Complete this task" }],
  tools: [myTools],
  agentLoopStrategy: maxIterations(10),
})) {
  // ...
}
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `AnyTextAdapter` | **Required.** The text adapter (e.g., `openaiText('gpt-4o')`) |
| `messages` | `ModelMessage[]` | **Required.** Conversation messages |
| `tools` | `Tool[]` | Tools for function calling |
| `systemPrompts` | `string[]` | System prompts to prepend |
| `temperature` | `number` | Randomness (0.0-2.0) |
| `topP` | `number` | Nucleus sampling parameter |
| `maxTokens` | `number` | Maximum tokens to generate |
| `metadata` | `Record<string, unknown>` | Request metadata |
| `modelOptions` | Provider-specific | Model-specific options |
| `abortController` | `AbortController` | For cancellation |
| `agentLoopStrategy` | `AgentLoopStrategy` | Controls loop behavior (default: `maxIterations(5)`) |
| `conversationId` | `string` | Tracking identifier |
| `outputSchema` | `z.ZodType` | For structured output after tool execution |

### Returns

- Default: `AsyncIterable<StreamChunk>` (streaming)
- With `outputSchema`: `Promise<z.infer<TSchema>>`

### Legacy API

The `agentLoop` function also supports a callback-based API for advanced use cases:

```typescript
const textFn = (opts) => chat({ adapter: openaiText("gpt-4o"), ...opts });

for await (const chunk of agentLoop(textFn, {
  messages: [...],
  tools: [...],
})) {
  // ...
}
```

---

## `chat(options)` (Deprecated)

> **Note**: `chat` will be replaced by `text` (for simple generation) and `agentLoop` (for agentic workflows). See the migration guide above.

Creates a streaming chat response with optional tool support.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Hello!" }],
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `adapter` - An AI adapter instance with model (e.g., `openaiText('gpt-4o')`)
- `messages` - Array of chat messages
- `tools?` - Array of tools for function calling
- `systemPrompts?` - System prompts to prepend to messages
- `agentLoopStrategy?` - Strategy for agent loops (default: `maxIterations(5)`)
- `abortController?` - AbortController for cancellation
- `modelOptions?` - Model-specific options

### Returns

An async iterable of `StreamChunk`.

---

## `toolDefinition(config)`

Creates an isomorphic tool definition that can be instantiated for server or client execution.

```typescript
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const myToolDef = toolDefinition({
  name: "my_tool",
  description: "Tool description",
  inputSchema: z.object({
    param: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  needsApproval: false,
});

// Server implementation
const myServerTool = myToolDef.server(async ({ param }) => {
  return { result: "..." };
});

// Client implementation
const myClientTool = myToolDef.client(async ({ param }) => {
  return { result: "..." };
});

// Use in agentLoop
agentLoop({
  adapter: openaiText("gpt-4o"),
  tools: [myServerTool],
  messages: [...],
});
```

### Parameters

- `name` - Tool name (must be unique)
- `description` - Tool description for the model
- `inputSchema` - Zod schema for input validation
- `outputSchema?` - Zod schema for output validation
- `needsApproval?` - Whether tool requires user approval
- `metadata?` - Additional metadata

### Returns

A `ToolDefinition` object with `.server()` and `.client()` methods.

---

## Agent Loop Strategies

Control how the agent loop behaves with these strategy functions.

### `maxIterations(count)`

Limits the number of tool execution iterations.

```typescript
import { maxIterations } from "@tanstack/ai";

agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [...],
  tools: [...],
  agentLoopStrategy: maxIterations(10),
});
```

### `untilFinishReason(reason)`

Continues until a specific finish reason is reached.

```typescript
import { untilFinishReason } from "@tanstack/ai";

agentLoop({
  // ...
  agentLoopStrategy: untilFinishReason("stop"),
});
```

### `combineStrategies(...strategies)`

Combines multiple strategies (all must return true to continue).

```typescript
import { combineStrategies, maxIterations, untilFinishReason } from "@tanstack/ai";

agentLoop({
  // ...
  agentLoopStrategy: combineStrategies(
    maxIterations(20),
    untilFinishReason("stop")
  ),
});
```

---

## Stream Utilities

### `toServerSentEventsStream(stream, abortController?)`

Converts a stream to a ReadableStream in Server-Sent Events format.

```typescript
import { toServerSentEventsStream, agentLoop } from "@tanstack/ai";

const stream = agentLoop({ adapter, messages, tools });
const readableStream = toServerSentEventsStream(stream);

return new Response(readableStream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});
```

### `streamToText(stream)`

Collects a stream into a single string.

```typescript
import { streamToText, experimental_text as text } from "@tanstack/ai";

const result = await streamToText(
  text({
    adapter: openaiText("gpt-4o"),
    messages: [{ role: "user", content: "Hello" }],
  })
);
```

---

## Types

### `ModelMessage`

```typescript
interface ModelMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId?: string;
}
```

### `StreamChunk`

```typescript
type StreamChunk =
  | ContentStreamChunk
  | ThinkingStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;
```

Stream chunks represent different types of data:

- **Content chunks** - Text content being generated
- **Thinking chunks** - Model's reasoning process (when supported)
- **Tool call chunks** - When the model calls a tool
- **Tool result chunks** - Results from tool execution
- **Done chunks** - Stream completion
- **Error chunks** - Stream errors

### `Tool`

```typescript
interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
  execute?: (args: any) => Promise<any> | any;
  needsApproval?: boolean;
}
```

---

## Complete Examples

### Simple Text Generation

```typescript
import { experimental_text as text } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

// Streaming
for await (const chunk of text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Write a haiku" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}

// Non-streaming
const response = await text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "What's the capital of France?" }],
  stream: false,
});
```

### Agentic Workflow with Tools

```typescript
import { experimental_agentLoop as agentLoop, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string(),
  }),
}).server(async ({ city }) => {
  return JSON.stringify({ temperature: 72, condition: "Sunny" });
});

for await (const chunk of agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

### Structured Output

```typescript
import { experimental_text as text } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const person = await text({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Generate a fictional character" }],
  outputSchema: z.object({
    name: z.string(),
    age: z.number(),
    backstory: z.string(),
  }),
});

console.log(person.name, person.age);
```

### Structured Output with Tool Execution

```typescript
import { experimental_agentLoop as agentLoop, toolDefinition } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const searchTool = toolDefinition({
  name: "search",
  description: "Search for information",
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => {
  return `Results for: ${query}`;
});

const result = await agentLoop({
  adapter: openaiText("gpt-4o"),
  messages: [{ role: "user", content: "Research AI trends and summarize" }],
  tools: [searchTool],
  outputSchema: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
  }),
});

console.log(result.summary);
```

---

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options
