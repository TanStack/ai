---
title: TanStack AI Core API
id: tanstack-ai-api
---

The core AI library for TanStack AI.

## Installation

```bash
npm install @tanstack/ai
```

## `ai(options)`

Creates a streaming chat response.

```typescript
import { ai } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = ai({
  adapter: openaiText(),
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `adapter` - An AI adapter instance (e.g., `openaiText()`, `anthropicText()`)
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
import { ai } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await ai({
  adapter: openaiSummarize(),
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
import { ai } from "@tanstack/ai";
import { openaiEmbed } from "@tanstack/ai-openai";

const result = await ai({
  adapter: openaiEmbed(),
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

// Use directly in ai() (server-side, no execute)
ai({
  tools: [myToolDef],
  // ...
});

// Or create server implementation
const myServerTool = myToolDef.server(async ({ param }) => {
  // Server-side implementation
  return { result: "..." };
});

// Use directly in ai() (server-side, no execute)
ai({
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
import { ai, toServerSentEventsStream } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = ai({
  adapter: openaiText(),
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
import { ai, toStreamResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = ai({
  adapter: openaiText(),
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
import { ai, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = ai({
  adapter: openaiText(),
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
import { ai } from "@tanstack/ai";
import {
  openaiText,
  openaiSummarize,
  openaiEmbed,
  openaiImage,
} from "@tanstack/ai-openai";

// --- Streaming chat
const stream = ai({
  adapter: openaiText(),
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});

// --- One-shot chat response
const response = await ai({
  adapter: openaiText(),
  messages: [{ role: "user", content: "What's the capital of France?" }],
  model: "gpt-4o",
  oneShot: true, // Resolves with a single, complete response
});

// --- Structured response
const parsed = await ai({
  adapter: openaiText(),
  messages: [{ role: "user", content: "Summarize this text in JSON with keys 'summary' and 'keywords': ... " }],
  model: "gpt-4o",
  parse: (content) => {
    // Example: Expecting JSON output from model
    try {
      return JSON.parse(content);
    } catch {
      return { summary: "", keywords: [] };
    }
  },
});

// --- Structured response with tools
import { toolDefinition } from "@tanstack/ai";
const weatherTool = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: {
    city: { type: "string", description: "City name" },
  },
  async execute({ city }) {
    // Implementation that fetches weather info
    return { temperature: 72, condition: "Sunny" };
  },
});

const toolResult = await ai({
  adapter: openaiText(),
  model: "gpt-4o",
  messages: [
    { role: "user", content: "What's the weather in Paris?" }
  ],
  tools: [weatherTool],
  parse: (content, toolsOutput) => ({
    answer: content,
    weather: toolsOutput.getWeather,
  }),
});

// --- Summarization
const summary = await ai({
  adapter: openaiSummarize(),
  model: "gpt-4o",
  text: "Long text to summarize...",
  maxLength: 100,
});

// --- Embeddings
const embeddings = await ai({
  adapter: openaiEmbed(),
  model: "text-embedding-3-small",
  input: "Text to embed",
});

// --- Image generation
const image = await ai({
  adapter: openaiImage(),
  model: "dall-e-3",
  prompt: "A futuristic city skyline at sunset",
  n: 1, // number of images
  size: "1024x1024",
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options
