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

## `chat(options)`

Creates a streaming chat response.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
  tools: [myTool],
  systemPrompts: ["You are a helpful assistant"],
  agentLoopStrategy: maxIterations(20),
});
```

### Parameters

- `adapter` - An AI adapter instance with model (e.g., `openaiText('gpt-5.2')`, `anthropicText('claude-sonnet-4-5')`)
- `messages` - Array of chat messages
- `tools?` - Array of tools for function calling
- `systemPrompts?` - System prompts to prepend to messages
- `agentLoopStrategy?` - Strategy for agent loops (default: `maxIterations(5)`)
- `abortController?` - AbortController for cancellation
- `modelOptions?` - Model-specific options (renamed from `providerOptions`)

### Returns

An async iterable of `StreamChunk`.

## `summarize(options)`

Creates a text summarization.

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5.2"),
  text: "Long text to summarize...",
  maxLength: 100,
  style: "concise",
});
```

### Parameters

- `adapter` - An AI adapter instance with model
- `text` - Text to summarize
- `maxLength?` - Maximum length of summary
- `style?` - Summary style ("concise" | "detailed")
- `modelOptions?` - Model-specific options

### Returns

A `SummarizationResult` with the summary text.

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
  adapter: openaiText("gpt-5.2"),
  tools: [myToolDef],
  messages: [{ role: "user", content: "..." }],
});

// Or create server implementation
const myServerTool = myToolDef.server(async ({ param }) => {
  // Server-side implementation
  return { result: "..." };
});

// Use directly in chat() (server-side, no execute)
chat({
  adapter: openaiText("gpt-5.2"),
  tools: [myServerTool],
  messages: [{ role: "user", content: "..." }],
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
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [...],
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

## `toServerSentEventsResponse(stream, init?)`

Converts a stream to an HTTP Response with proper SSE headers.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [...],
});
return toServerSentEventsResponse(stream);
```

### Parameters

- `stream` - Async iterable of `StreamChunk`
- `init?` - Optional ResponseInit options (including `abortController`)

### Returns

A `Response` object suitable for HTTP endpoints with SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`).

## `maxIterations(count)`

Creates an agent loop strategy that limits iterations.

```typescript
import { chat, maxIterations } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [...],
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
import { chat, summarize, generateImage } from "@tanstack/ai";
import {
  openaiText,
  openaiSummarize,
  openaiImage,
} from "@tanstack/ai-openai";

// --- Streaming chat
const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Hello!" }],
});

// --- One-shot chat response (stream: false)
const response = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "What's the capital of France?" }],
  stream: false, // Returns a Promise<string> instead of AsyncIterable
});

// --- Structured response with outputSchema
import { z } from "zod";
const parsed = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [{ role: "user", content: "Summarize this text in JSON with keys 'summary' and 'keywords': ... " }],
  outputSchema: z.object({
    summary: z.string(),
    keywords: z.array(z.string()),
  }),
});

// --- Structured response with tools
import { toolDefinition } from "@tanstack/ai";
const weatherTool = toolDefinition({
  name: "getWeather",
  description: "Get the current weather for a city",
  inputSchema: z.object({
    city: z.string().describe("City name"),
  }),
}).server(async ({ city }) => {
  // Implementation that fetches weather info
  return JSON.stringify({ temperature: 72, condition: "Sunny" });
});

const toolResult = await chat({
  adapter: openaiText("gpt-5.2"),
  messages: [
    { role: "user", content: "What's the weather in Paris?" }
  ],
  tools: [weatherTool],
  outputSchema: z.object({
    answer: z.string(),
    weather: z.object({
      temperature: z.number(),
      condition: z.string(),
    }),
  }),
});

// --- Summarization
const summary = await summarize({
  adapter: openaiSummarize("gpt-5.2"),
  text: "Long text to summarize...",
  maxLength: 100,
});

// --- Image generation
const image = await generateImage({
  adapter: openaiImage("dall-e-3"),
  prompt: "A futuristic city skyline at sunset",
  numberOfImages: 1,
  size: "1024x1024",
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Adapters](../adapters/openai) - Explore adapter options
