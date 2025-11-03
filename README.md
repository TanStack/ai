# @tanstack/ai

A powerful, open-source AI SDK with a unified interface across multiple providers. No vendor lock-in, no proprietary formats, just clean TypeScript and honest open source.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, Ollama, Google Gemini
- **Multi-Language Support** - TypeScript, Python, and PHP packages
- **Unified API** - Same interface across all providers
- **Standalone Functions** - Direct type-safe functions that infer from adapters
- **AI Class** - Reusable instances with system prompts
- **Framework-Agnostic Client** - Headless chat client for any JavaScript environment
- **Automatic Fallback** - Try multiple adapters in sequence until one succeeds
- **Structured Outputs** - Type-safe JSON responses with `responseFormat()` helper
- **Structured Streaming** - JSON chunks with token deltas and metadata
- **Stream Processing** - Smart chunking strategies for optimal UX (punctuation, word boundaries, etc.)
- **Tool/Function Calling** - Automatic execution loop - no manual tool management needed
- **React Hooks & Components** - Simple `useChat` hook and pre-built UI components
- **TypeScript First** - Full type safety with inference from adapters
- **Zero Lock-in** - Switch providers at runtime without code changes

## Quick Start

### Standalone Functions (Recommended)

The easiest way to use the SDK - just pass an adapter and get full type inference:

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Type-safe chat with automatic inference from adapter
// chat() streams responses with automatic tool execution
for await (const chunk of chat({
  adapter: openai(), // Automatically uses OPENAI_API_KEY from env
  model: "gpt-4o", // <-- Autocompletes with OpenAI models
  messages: [{ role: "user", content: "Hello!" }],
  providerOptions: {
    // <-- Typed as OpenAI-specific options!
    store: true,
    parallelToolCalls: true,
  },
})) {
  if (chunk.type === "content") {
    console.log(chunk.delta); // Stream tokens as they arrive
  }
}
```

**Why use standalone functions?**

- ✅ **Type Inference** - Model and providerOptions types are inferred from the adapter
- ✅ **Simplicity** - No class instantiation needed
- ✅ **Direct** - Call the function you need with the adapter you want
- ✅ **Flexible** - Easy to switch adapters on a per-call basis

Available standalone functions:

- `chat()` - Streaming chat with **automatic tool execution loop**
- `chatCompletion()` - Promise-based chat with optional structured output
- `summarize()` - Text summarization
- `embed()` - Generate embeddings
- `image()` - Image generation
- `audio()` - Audio transcription
- `speak()` - Text-to-speech
- `video()` - Video generation

Helper functions:

- `toStreamResponse()` - Convert chat stream to HTTP Response with SSE headers
- `toServerSentEventsStream()` - Convert chat stream to ReadableStream in Server-Sent Events format
- `tool()` - Create a tool with execute function
- `responseFormat()` - Create typed response format for structured output
- `maxIterations()`, `untilFinishReason()`, `combineStrategies()` - Agent loop strategy helpers

### AI Class (For Reusable Instances)

For applications that need to configure system prompts once and reuse them:

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Create an AI instance with system prompts
const aiInstance = ai({
  adapter: openai(),
  systemPrompts: ["You are a helpful assistant."],
});

// Use the instance - system prompts are automatically prepended
// chat() returns a stream with automatic tool execution
for await (const chunk of aiInstance.chat({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

**Why use the AI class?**

- ✅ **System Prompts** - Set default system prompts
- ✅ **Reusable** - Configure once, use many times
- ✅ **Type Safety** - Full type inference from adapter

### Structured Outputs

Get type-safe JSON responses with the `responseFormat()` helper:

```typescript
import { chat, responseFormat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Define your schema
const guitarSchema = responseFormat({
  name: "guitar_info",
  schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      price: { type: "number" },
    },
    required: ["id", "name"],
    additionalProperties: false,
  } as const, // Important for type inference!
});

// Get typed response
const result = await chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Recommend a guitar" }],
  options: {
    responseFormat: guitarSchema, // Only available in promise mode
  },
});

// ✅ res.data is now fully typed!
if (result.data) {
  console.log(result.data.name); // string
  console.log(result.data.price); // number
}
```

## Installation

> Note
>
> - Structured outputs via `options.responseFormat` are only available in promise mode. When using `as: "stream"` or `as: "response"`, structured JSON is not parsed and you receive raw text/stream.
> - On successful parsing, `result.data` is populated and typed; if parsing fails, `result.data` will be `undefined` and `result.content` will contain the raw model output.

### TypeScript/JavaScript

```bash
# Core library
npm install @tanstack/ai

# Provider adapters (install what you need)
npm install @tanstack/ai-openai
npm install @tanstack/ai-anthropic
npm install @tanstack/ai-ollama
npm install @tanstack/ai-gemini

# Framework-agnostic client (for frontend/headless usage)
npm install @tanstack/ai-client

# Automatic fallback wrapper
npm install @tanstack/ai-fallback

# React hooks (for frontend chat UIs)
npm install @tanstack/ai-react

# React UI components (pre-built chat components)
npm install @tanstack/ai-react-ui
```

### Python

```bash
# Python utilities for stream conversion and message formatting
pip install tanstack-ai
```

### PHP

```bash
# PHP utilities for stream conversion and message formatting
composer require tanstack/ai
```

## API Reference

### Standalone Functions

#### `chat(options)`

Stream a chat conversation with **automatic tool execution loop**. Returns `AsyncIterable<StreamChunk>`.

Use with `toStreamResponse()` or `toServerSentEventsStream()` for HTTP streaming.

**Important:** When tools are provided, the `chat()` method automatically:

- Executes tools when the model calls them
- Emits `tool_result` chunks with execution results
- Adds tool results to messages and continues conversation
- Repeats until complete (up to `maxIterations`, default: 5)

```typescript
// Streaming mode
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  tools: [weatherTool], // Optional: auto-executed when called
  agentLoopStrategy: maxIterations(5), // Optional: control loop behavior
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    console.log(chunk.delta); // Incremental token
  } else if (chunk.type === "tool_call") {
    console.log("Calling:", chunk.toolCall.function.name);
  } else if (chunk.type === "tool_result") {
    console.log("Tool result:", chunk.content);
  }
}
```

#### `chatCompletion(options)`

Complete a chat conversation with optional structured output. Returns `Promise<ChatCompletionResult>`.

```typescript
// Promise mode with structured output
const result = await chatCompletion({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  temperature: 0.7,
  maxTokens: 1000,
  providerOptions: {
    /* provider-specific options */
  },
});

// With structured output
const structuredResult = await chatCompletion({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  output: responseFormat({
    /* schema */
  }),
});
```

#### `summarize(options)`

Summarize text using AI.

```typescript
const result = await summarize({
  adapter: openai(),
  model: "gpt-4o",
  text: "Long text to summarize...",
  maxLength: 200,
});

console.log(result.summary);
```

#### `embed(options)`

Generate embeddings for text.

```typescript
const result = await embed({
  adapter: openai(),
  model: "text-embedding-ada-002",
  input: ["Text 1", "Text 2"],
});

console.log(result.embeddings); // number[][]
```

#### `image(options)`

Generate images from text prompts.

```typescript
const result = await image({
  adapter: openai(),
  model: "dall-e-3",
  prompt: "A beautiful sunset over mountains",
  size: "1024x1024",
});

console.log(result.image?.base64);
```

#### `audio(options)`

Transcribe audio files.

```typescript
const result = await audio({
  adapter: openai(),
  model: "whisper-1",
  file: audioFile, // File, Blob, or Buffer
  language: "en",
});

console.log(result.text);
```

#### `speak(options)`

Convert text to speech.

```typescript
const result = await speak({
  adapter: openai(),
  model: "tts-1",
  input: "Hello, world!",
  voice: "alloy",
});

// result.audio is a Buffer or Blob
```

#### `video(options)`

Generate videos from text prompts.

```typescript
const result = await video({
  adapter: openai(),
  model: "sora-1",
  prompt: "A timelapse of a flower blooming",
  duration: 5,
});

// result.video is a Buffer or Blob
```

### AI instance

#### Constructor

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const aiInstance = ai(openai(), {
  systemPrompts: ["You are a helpful assistant."],
});
```

#### Methods

##### `chat(options)`

Stream a chat conversation. Returns `AsyncIterable<StreamChunk>`. System prompts are automatically prepended.

**Important:** This method runs an **automatic tool execution loop**. When tools are provided and the model calls them, the SDK:

- Executes the tool's `execute` function
- Adds the result to messages
- Continues the conversation automatically
- Repeats up to `maxIterations` (default: 5)

```typescript
const stream = aiInstance.chat({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  tools: [weatherTool], // Optional: tools are auto-executed
  agentLoopStrategy: maxIterations(5), // Optional: control loop behavior
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    console.log(chunk.delta); // Text content
  } else if (chunk.type === "tool_call") {
    console.log("Calling tool:", chunk.toolCall.function.name);
  } else if (chunk.type === "tool_result") {
    console.log("Tool result:", chunk.content);
  }
}
```

##### `chatCompletion(options)`

Complete a chat conversation with optional structured output. Returns `Promise<ChatCompletionResult>`. System prompts are automatically prepended.

```typescript
const result = await aiInstance.chatCompletion({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

##### `summarize(options)`, `embed(options)`, etc.

All standalone functions are available as methods on the AI instance.

### Helper Functions

#### `toStreamResponse(stream, init?)`

Convert a chat stream to an HTTP Response with Server-Sent Events headers.

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
  });

  // Returns Response with SSE headers and streaming body
  return toStreamResponse(stream);
}
```

#### `toServerSentEventsStream(stream)`

Convert a chat stream to a ReadableStream in Server-Sent Events format.

Useful when you need the ReadableStream directly (for custom response handling):

```typescript
import { chat, toServerSentEventsStream } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [...],
});

// Get ReadableStream in SSE format
const readableStream = toServerSentEventsStream(stream);

// Use with custom Response
return new Response(readableStream, {
  headers: {
    "Content-Type": "text/event-stream",
    "X-Custom-Header": "value",
  },
});
```

#### `responseFormat(config)`

Create a typed response format for structured outputs.

```typescript
import { responseFormat } from "@tanstack/ai";

const schema = responseFormat({
  name: "person",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name"],
    additionalProperties: false,
  } as const, // Important for type inference!
});

// Use with chat
const result = await chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me about John Doe" }],
  options: {
    responseFormat: schema,
  },
});

// result.data is typed based on the schema (promise mode only)
if (result.data) {
  console.log(result.data.name); // string
  console.log(result.data.age); // number
}
// If parsing fails, `result.data` will be undefined and `result.content` will contain raw text.
```

#### `tool(config)`

Create a tool for function calling with automatic execution.

```typescript
import { tool } from "@tanstack/ai";

const weatherTool = tool({
  type: "function",
  function: {
    name: "getWeather",
    description: "Get current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
  execute: async (args) => {
    const weather = await fetchWeather(args.location);
    return JSON.stringify(weather);
  },
});

// Use with streaming chat - tools are automatically executed in a loop
for await (const chunk of chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "tool_result") {
    console.log("Tool executed:", chunk.content);
  }
}
```

**🔄 Automatic Tool Execution Loop:**

The `chat()` method automatically handles tool execution in a loop:

1. **Model decides** to call a tool → emits `tool_call` chunks
2. **SDK executes** the tool's `execute` function → emits `tool_result` chunks
3. **SDK adds** tool results to messages and **continues** the conversation
4. **Model responds** with the final answer based on tool results
5. Repeats until no more tools are needed (controlled by `agentLoopStrategy` or `maxIterations`)

**You don't need to manage tool execution** - the SDK handles everything internally. Just provide tools with `execute` functions and the loop runs automatically.

**Advanced:** Control the loop with `agentLoopStrategy`:

```typescript
import { maxIterations, combineStrategies } from "@tanstack/ai";

// Simple: max 10 iterations
agentLoopStrategy: maxIterations(10);

// Custom: stop based on any condition
agentLoopStrategy: ({ iterationCount, messages, finishReason }) => {
  return iterationCount < 10 && messages.length < 100;
};

// Combined: multiple conditions
agentLoopStrategy: combineStrategies([
  maxIterations(10),
  ({ messages }) => messages.length < 50,
]);
```

**📚 See also:** [Complete Tool Execution Loop Documentation](docs/TOOL_EXECUTION_LOOP.md)

### React Hooks

#### useChat

Build chat interfaces with the `useChat` hook:

```typescript
import { useChat } from "@tanstack/ai-react";

function ChatComponent() {
  const {
    messages, // Current message list
    sendMessage, // Send a message
    isLoading, // Is generating response
    error, // Current error
    append, // Add message programmatically
    reload, // Reload last response
    stop, // Stop generation
    clear, // Clear all messages
  } = useChat({
    api: "/api/chat",
    onChunk: (chunk) => console.log(chunk),
  });

  const [input, setInput] = useState("");

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong> {message.content}
        </div>
      ))}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            sendMessage(input);
            setInput("");
          }
        }}
      />
      <button
        onClick={() => {
          sendMessage(input);
          setInput("");
        }}
      >
        Send
      </button>
    </div>
  );
}
```

## Examples

### Basic Chat

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const result = await chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Explain quantum computing" }],
});

console.log(result.content);
```

### Streaming

```typescript
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Tell me a story" }],
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
  if (chunk.type === "done") {
    console.log(`\nTokens: ${chunk.usage?.totalTokens}`);
  }
}
```

### Switching Providers

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { anthropic } from "@tanstack/ai-anthropic";

// Use OpenAI
const result1 = await chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

// Switch to Anthropic - same code works!
const result2 = await chat({
  adapter: anthropic(),
  model: "claude-3-5-sonnet-20241022",
  messages: [{ role: "user", content: "Hello" }],
});
```

### Tool Calling

The `chat()` method includes an **automatic tool execution loop** that handles all tool calling internally.

```typescript
import { chat, tool } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Define a tool with an execute function
const weatherTool = tool({
  type: "function",
  function: {
    name: "getWeather",
    description: "Get weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
      },
      required: ["location"],
    },
  },
  execute: async (args) => {
    // This function is automatically called by the SDK
    const weather = await fetchWeatherAPI(args.location);
    return JSON.stringify(weather);
  },
});

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
  maxIterations: 5, // Optional: max tool execution rounds (default: 5)
});

// The SDK automatically executes tools and emits chunks for each step
for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta); // Stream text response
  } else if (chunk.type === "tool_call") {
    console.log(`→ Calling: ${chunk.toolCall.function.name}`);
  } else if (chunk.type === "tool_result") {
    console.log(`✓ Result: ${chunk.content}`);
  }
}
```

**🔄 How the Automatic Tool Execution Loop Works:**

1. **User sends message** → "What's the weather in Paris?"
2. **Model decides** to call `getWeather` tool → `tool_call` chunk emitted
3. **SDK automatically executes** `weatherTool.execute()` → `tool_result` chunk emitted
4. **SDK adds** assistant message (with tool call) + tool result message to messages
5. **SDK continues** conversation by calling the model again with updated messages
6. **Model responds** with final answer → "The weather in Paris is sunny, 72°F"
7. **Loop repeats** if model calls more tools (up to `maxIterations`)

**Key Points:**

- ✅ Tools are executed **automatically** by the SDK
- ✅ Tool results are **automatically** added to conversation
- ✅ The conversation **automatically continues** until complete
- ✅ You only need to handle the stream chunks for display
- ✅ No manual tool execution or message management required

### HTTP Endpoint (TanStack Start)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const stream = chat({
          adapter: openai(),
          model: "gpt-4o",
          messages,
          tools: [weatherTool], // Optional: auto-executed in loop
          agentLoopStrategy: maxIterations(5), // Optional: control loop
        });

        // Convert stream to Response with SSE headers
        // Tool execution happens automatically, results are streamed to client
        return toStreamResponse(stream);
      },
    },
  },
});
```

**The `chat()` method automatically handles tool execution:**

- When the model calls a tool, the SDK executes it on the server
- Tool results are emitted as `tool_result` chunks
- The conversation continues automatically until complete
- Clients receive both `tool_call` and `tool_result` chunks in the stream

## Multi-Language Support

TanStack AI provides utilities for multiple programming languages, making it easy to build AI-powered applications in your preferred environment.

### Python (`tanstack-ai`)

Build AI servers with Python using FastAPI, Flask, or any other framework:

```python
from tanstack_ai import StreamChunkConverter, format_messages_for_anthropic, format_sse_chunk
from anthropic import Anthropic

# Convert messages to provider format
system_message, anthropic_messages = format_messages_for_anthropic(messages)

# Initialize converter
converter = StreamChunkConverter(model="claude-3-haiku-20240307", provider="anthropic")

# Stream and convert events
async for event in anthropic_stream:
    chunks = await converter.convert_event(event)
    for chunk in chunks:
        yield format_sse_chunk(chunk)
```

**Features:**
- Message formatting for Anthropic and OpenAI
- Stream chunk conversion from provider events
- SSE formatting utilities
- Type-safe with Pydantic models

**See:** [Python Package README](packages/python/tanstack-ai/README.md) | [Python FastAPI Example](examples/python-fastapi/README.md)

### PHP (`tanstack/ai`)

Build AI servers with PHP using Slim, Laravel, or any other framework:

```php
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\MessageFormatters;
use TanStack\AI\SSEFormatter;

// Convert messages to provider format
[$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($messages);

// Initialize converter
$converter = new StreamChunkConverter(
    model: "claude-3-haiku-20240307",
    provider: "anthropic"
);

// Stream and convert events
foreach ($anthropicStream as $event) {
    $chunks = $converter->convertEvent($event);
    foreach ($chunks as $chunk) {
        echo SSEFormatter::formatChunk($chunk);
    }
}
```

**Features:**
- Message formatting for Anthropic and OpenAI
- Stream chunk conversion from provider events
- SSE formatting utilities
- PHP 8.1+ with named arguments and type safety

**See:** [PHP Package README](packages/php/tanstack-ai/README.md) | [PHP Slim Example](examples/php-slim/README.md)

### TypeScript Client (`@tanstack/ai-client`)

Use the framework-agnostic client to connect to any backend (Python, PHP, Node.js, etc.):

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("http://localhost:8000/chat"),
  onMessagesChange: (messages) => {
    console.log("Messages:", messages);
  },
});

await client.sendMessage("Hello!");
```

**Features:**
- Connection adapters for SSE, HTTP streams, and server functions
- Stream processing with smart chunking strategies
- Framework-agnostic (use with React, Vue, Svelte, vanilla JS, etc.)
- Automatic tool call handling

**See:** [@tanstack/ai-client README](packages/typescript/ai-client/README.md) | [Vanilla Chat Example](examples/vanilla-chat/README.md)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in dev mode
pnpm dev

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Run tests for a specific package
cd packages/ai && pnpm test

# Clean build artifacts
pnpm clean
```

## Documentation

### User Guides

- 📖 [Tool Execution Loop](docs/TOOL_EXECUTION_LOOP.md) - How automatic tool execution works
- 📖 [Agent Loop Strategies](docs/AGENT_LOOP_STRATEGIES.md) - Control the tool execution loop
- 📖 [Connection Adapters Guide](docs/CONNECTION_ADAPTERS_GUIDE.md) - Complete guide with examples
- 📖 [Connection Adapters API](packages/typescript/ai-client/docs/CONNECTION_ADAPTERS.md) - API reference
- 📖 [Stream Processing Quick Start](packages/typescript/ai-client/docs/STREAM_QUICKSTART.md) - Smart chunking strategies
- 📖 [Unified Chat API](docs/UNIFIED_CHAT_API.md) - `chat()` vs `chatCompletion()` methods
- 📖 [Quick Reference](docs/UNIFIED_CHAT_QUICK_REFERENCE.md) - Quick API reference
- 📖 [Tool Registry](docs/TOOL_REGISTRY.md) - Define tools once, use everywhere
- 📖 [Type Safety](docs/TYPE_SAFETY.md) - Type-safe multi-adapter usage

### Examples

#### TypeScript

- 📖 [CLI Example](examples/cli/README.md) - Interactive command-line interface with tool calling
- 📖 [TanStack Chat (ts-chat)](examples/ts-chat/README.md) - Full-stack chat app with TanStack Start, Router, and Store
- 📖 [Vanilla Chat](examples/vanilla-chat/README.md) - Framework-free chat with `@tanstack/ai-client`

#### Python

- 📖 [Python FastAPI Server](examples/python-fastapi/README.md) - FastAPI server streaming AI responses in SSE format

#### PHP

- 📖 [PHP Slim Framework Server](examples/php-slim/README.md) - Slim Framework server with Anthropic and OpenAI support

### Package Documentation

#### TypeScript Packages

- 📖 [@tanstack/ai-client](packages/typescript/ai-client/README.md) - Framework-agnostic headless client
- 📖 [@tanstack/ai-fallback](packages/typescript/ai-fallback/README.md) - Automatic fallback wrapper

#### Python Packages

- 📖 [tanstack-ai (Python)](packages/python/tanstack-ai/README.md) - Python stream conversion and message formatting

#### PHP Packages

- 📖 [tanstack/ai (PHP)](packages/php/tanstack-ai/README.md) - PHP stream conversion and message formatting

### Implementation Details

- 📖 [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) - Architecture overview
- 📖 [Unified Chat Implementation](docs/UNIFIED_CHAT_IMPLEMENTATION.md) - `chat()` and `chatCompletion()` implementation
- 📖 [Migration Guide](docs/MIGRATION_UNIFIED_CHAT.md) - Migrating from `as` option API

## Contributing

We welcome contributions! This is a community-driven project providing a truly open alternative to proprietary AI SDKs.

## License

MIT - Use freely, modify, share. No strings attached.

## Philosophy

Unlike certain companies that use open source as marketing only to lock you into paid services, @tanstack/ai is committed to remaining truly open source. No enshittification, no bait-and-switch, just honest software that respects developers.

---

Built with ❤️ by the open-source community.
