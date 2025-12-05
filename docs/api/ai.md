---
title: TanStack AI Core API
id: tanstack-ai-api
---

The core AI library for TanStack AI.

## Installation

```bash
npm install @tanstack/ai
```

## `chat(options)`

Creates a streaming chat response.

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `adapter` - An AI adapter instance (e.g., `openai()`, `anthropic()`)
- `messages` - Array of chat messages
- `model` - Model identifier (type-safe based on adapter)
- `tools?` - Array of tools for function calling
- `systemPrompts?` - System prompts to prepend to messages
- `agentLoopStrategy?` - Strategy for agent loops (default: `maxIterations(5)`)
- `abortController?` - AbortController for cancellation
- `providerOptions?` - Provider-specific options

### Returns

An async iterable of `StreamChunk`.

## `summarize(options)`

Creates a text summarization.

```typescript
import { summarize } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openai(),
  model: "gpt-4o",
  text: "Long text to summarize...",
  maxLength: 100,
  style: "concise",
});
```

### Parameters

- `adapter` - An AI adapter instance
- `model` - Model identifier (type-safe based on adapter)
- `text` - Text to summarize
- `maxLength?` - Maximum length of summary
- `style?` - Summary style ("concise" | "detailed")

### Returns

A `SummarizationResult` with the summary text.

## `embedding(options)`

Creates embeddings for text input.

```typescript
import { embedding } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const result = await embedding({
  adapter: openai(),
  model: "text-embedding-3-small",
  input: "Text to embed",
});
```

### Parameters

- `adapter` - An AI adapter instance
- `model` - Embedding model identifier (type-safe based on adapter)
- `input` - Text or array of texts to embed

### Returns

An `EmbeddingResult` with embeddings array.

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
  needsApproval: false, // Optional
});

// Or create client implementation
const myClientTool = myToolDef.client(async ({ param }) => {
  // Client-side implementation
  return { result: "..." };
});

// Use directly in chat() (server-side, no execute)
chat({
  tools: [myToolDef],
  // ...
});

// Or create server implementation
const myServerTool = myToolDef.server(async ({ param }) => {
  // Server-side implementation
  return { result: "..." };
});

// Use directly in chat() (server-side, no execute)
chat({
  tools: [myServerTool],
  // ...
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

A `ToolDefinition` object with `.server()` and `.client()` methods for creating concrete implementations.

## `toServerSentEventsStream(stream, abortController?)`

Converts a stream to a ReadableStream in Server-Sent Events format.

```typescript
import { toServerSentEventsStream, chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  messages: [...],
  model: "gpt-4o",
});
const readableStream = toServerSentEventsStream(stream);
```

### Parameters

- `stream` - Async iterable of `StreamChunk`
- `abortController?` - Optional AbortController to abort when stream is cancelled

### Returns

A `ReadableStream<Uint8Array>` in Server-Sent Events format. Each chunk is:
- Prefixed with `"data: "`
- Followed by `"\n\n"`
- Stream ends with `"data: [DONE]\n\n"`

## `toStreamResponse(stream, init?)`

Converts a stream to an HTTP Response with proper SSE headers.

```typescript
import { toStreamResponse, chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  messages: [...],
  model: "gpt-4o",
});
return toStreamResponse(stream);
```

### Parameters

- `stream` - Async iterable of `StreamChunk`
- `init?` - Optional ResponseInit options (including `abortController`)

### Returns

A `Response` object suitable for HTTP endpoints with SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).

## `maxIterations(count)`

Creates an agent loop strategy that limits iterations.

```typescript
import { maxIterations, chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  messages: [...],
  model: "gpt-4o",
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
type StreamChunk =
  | ContentStreamChunk
  | ThinkingStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;

interface ThinkingStreamChunk {
  type: "thinking";
  id: string;
  model: string;
  timestamp: number;
  delta?: string; // Incremental thinking token
  content: string; // Accumulated thinking content
}
```

Stream chunks represent different types of data in the stream:

- **Content chunks** - Text content being generated
- **Thinking chunks** - Model's reasoning process (when supported by the model)
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

## Usage Examples

```typescript
import { chat, summarize, embedding } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const adapter = openai();

// Streaming chat
const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});

// Summarization
const summary = await summarize({
  adapter,
  model: "gpt-4o",
  text: "Long text to summarize...",
  maxLength: 100,
});

// Embeddings
const embeddings = await embedding({
  adapter,
  model: "text-embedding-3-small",
  input: "Text to embed",
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options
