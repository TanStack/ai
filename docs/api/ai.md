# @tanstack/ai API

The core AI library for TanStack AI.

## Installation

```bash
npm install @tanstack/ai
```

## `ai(adapter, config?)`

Creates an AI instance with the specified adapter.

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const aiInstance = ai(openai());
```

### Parameters

- `adapter` - An AI adapter instance (e.g., `openai()`, `anthropic()`)
- `config` - Optional configuration:
  - `systemPrompts?: string[]` - System prompts to prepend to messages

### Returns

An `AI` instance with methods for chat, completion, and more.

## `aiInstance.chat(options)`

Creates a streaming chat response.

```typescript
const stream = aiInstance.chat({
  messages: [
    { role: "user", content: "Hello!" },
  ],
  model: "gpt-4o",
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `messages` - Array of chat messages
- `model` - Model identifier (type-safe based on adapter)
- `tools?` - Array of tools for function calling
- `systemPrompts?` - System prompts (overrides instance-level)
- `agentLoopStrategy?` - Strategy for agent loops (default: `maxIterations(5)`)
- `options?` - Additional options:
  - `abortSignal?` - AbortSignal for cancellation
- `providerOptions?` - Provider-specific options

### Returns

An async iterable of `StreamChunk`.

## `aiInstance.chatCompletion(options)`

Creates a non-streaming chat completion.

```typescript
const result = await aiInstance.chatCompletion({
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});
```

### Parameters

Same as `chat()`, but returns a promise instead of a stream.

### Returns

A `ChatCompletionResult` with the full response.

## `tool(config)`

Creates a tool definition.

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const myTool = tool({
  description: "Tool description",
  inputSchema: z.object({
    param: z.string(),
  }),
  execute: async ({ param }) => {
    // Tool implementation
    return { result: "..." };
  },
  requiresApproval: false, // Optional
});
```

### Parameters

- `description` - Tool description for the model
- `inputSchema` - Zod schema for input validation
- `execute` - Async function to execute the tool
- `requiresApproval?` - Whether tool requires user approval

### Returns

A `Tool` object.

## `toStreamResponse(stream)`

Converts a stream to an HTTP Response.

```typescript
import { toStreamResponse } from "@tanstack/ai";

const stream = aiInstance.chat({ ... });
return toStreamResponse(stream);
```

### Parameters

- `stream` - Async iterable of `StreamChunk`

### Returns

A `Response` object suitable for HTTP endpoints.

## `maxIterations(count)`

Creates an agent loop strategy that limits iterations.

```typescript
import { maxIterations } from "@tanstack/ai";

const stream = aiInstance.chat({
  ...,
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `count` - Maximum number of tool execution iterations

### Returns

An `AgentLoopStrategy` object.

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
interface StreamChunk {
  type: "content" | "tool_call" | "tool_result" | "done";
  // ... chunk-specific fields
}
```

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
  requiresApproval?: boolean;
}
```

## Standalone Functions

TanStack AI also provides standalone functions for convenience:

```typescript
import { chat, chatCompletion, summarize, embed } from "@tanstack/ai";

// Streaming chat
const stream = chat({
  adapter: openai(),
  messages: [...],
  model: "gpt-4o",
});

// Non-streaming completion
const result = await chatCompletion({
  adapter: openai(),
  messages: [...],
  model: "gpt-4o",
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options

