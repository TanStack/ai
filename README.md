# @tanstack/ai

A powerful, open-source AI SDK with a unified interface across multiple providers. No vendor lock-in, no proprietary formats, just clean TypeScript and honest open source.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, Ollama, Google Gemini
- **Unified API** - Same interface across all providers
- **Standalone Functions** - Direct type-safe functions that infer from adapters
- **AI Class** - Reusable instances with system prompts
- **Structured Outputs** - Type-safe JSON responses with `responseFormat()` helper
- **Structured Streaming** - JSON chunks with token deltas and metadata
- **Tool/Function Calling** - First-class support with automatic execution
- **React Hooks** - Simple `useChat` hook for building chat UIs
- **TypeScript First** - Full type safety with inference from adapters
- **Zero Lock-in** - Switch providers at runtime without code changes

## Quick Start

### Standalone Functions (Recommended)

The easiest way to use the SDK - just pass an adapter and get full type inference:

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Type-safe chat with automatic inference from adapter
const result = await chat({
  adapter: openai(), // Automatically uses OPENAI_API_KEY from env
  model: "gpt-4o", // <-- Autocompletes with OpenAI models
  messages: [{ role: "user", content: "Hello!" }],
  providerOptions: { // <-- Typed as OpenAI-specific options!
    store: true,
    parallelToolCalls: true,
  }
});

console.log(result.content);
```

**Why use standalone functions?**
- ✅ **Type Inference** - Model and providerOptions types are inferred from the adapter
- ✅ **Simplicity** - No class instantiation needed
- ✅ **Direct** - Call the function you need with the adapter you want
- ✅ **Flexible** - Easy to switch adapters on a per-call basis

Available standalone functions:
- `chat()` - Chat completion with streaming and structured outputs
- `summarize()` - Text summarization
- `embed()` - Generate embeddings
- `image()` - Image generation
- `audio()` - Audio transcription
- `speak()` - Text-to-speech
- `video()` - Video generation

### AI Class (For Reusable Instances)

For applications that need to configure system prompts once and reuse them:

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Create an AI instance with system prompts
const aiInstance = ai({
  adapter: openai(),
  systemPrompts: ["You are a helpful assistant."]
});

// Use the instance - system prompts are automatically prepended
await aiInstance.chat({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
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
  output: guitarSchema, // Only available in promise mode
});

// ✅ res.data is now fully typed!
if (result.data) {
  console.log(result.data.name); // string
  console.log(result.data.price); // number
}
```

## Installation

```bash
# Core library
npm install @tanstack/ai

# Provider adapters (install what you need)
npm install @tanstack/ai-openai
npm install @tanstack/ai-anthropic
npm install @tanstack/ai-ollama
npm install @tanstack/ai-gemini

# React hooks (for frontend chat UIs)
npm install @tanstack/ai-react
```

 
## API Reference

### Standalone Functions

#### `chat(options)`

Stream a chat conversation. Returns `AsyncIterable<StreamChunk>`.

```typescript
// Streaming mode
const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of stream) {
  if (chunk.type === "content") {
    console.log(chunk.delta); // Incremental token
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
  providerOptions: { /* provider-specific options */ }
});

// With structured output
const structuredResult = await chatCompletion({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  output: responseFormat({ /* schema */ })
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

const aiInstance = ai({
  adapter: openai(),
  systemPrompts: ["You are a helpful assistant."],
});
```

#### Methods

##### `chat(options)`

Stream a chat conversation. Returns `AsyncIterable<StreamChunk>`. System prompts are automatically prepended.

```typescript
const stream = aiInstance.chat({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of stream) {
  console.log(chunk);
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
  output: schema,
});

// result.data is typed based on the schema
if (result.data) {
  console.log(result.data.name); // string
  console.log(result.data.age); // number
}
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

// Use with chat
const result = await chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
});
```

**Note:** When using streaming (`chat()`), tools with `execute` functions are automatically called and their results are added to the conversation.
 
### React Hooks

#### useChat

Build chat interfaces with the `useChat` hook:

```typescript
import { useChat } from "@tanstack/ai-react";

function ChatComponent() {
  const {
    messages,      // Current message list
    sendMessage,   // Send a message
    isLoading,     // Is generating response
    error,         // Current error
    append,        // Add message programmatically
    reload,        // Reload last response
    stop,          // Stop generation
    clear,         // Clear all messages
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
      <button onClick={() => { sendMessage(input); setInput(""); }}>
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

```typescript
import { chat, tool } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

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
    return JSON.stringify({ temp: 72, condition: "sunny" });
  },
});

const stream = chat({
  adapter: openai(),
  model: "gpt-4o",
  messages: [{ role: "user", content: "What's the weather in Paris?" }],
  tools: [weatherTool],
});

// Tool is automatically executed and results are added to conversation
for await (const chunk of stream) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
}
```

### HTTP Endpoint (TanStack Start)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { chat } from "@tanstack/ai";
import { toStreamResponse } from "@tanstack/ai/stream-to-response";
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
        });

        // Convert stream to Response with SSE headers
        return toStreamResponse(stream);
      },
    },
  },
});
```

  
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

# Clean build artifacts
pnpm clean
```

## Contributing

We welcome contributions! This is a community-driven project providing a truly open alternative to proprietary AI SDKs.

## License

MIT - Use freely, modify, share. No strings attached.

## Philosophy

Unlike certain companies that use open source as marketing only to lock you into paid services, @tanstack/ai is committed to remaining truly open source. No enshittification, no bait-and-switch, just honest software that respects developers.

---

Built with ❤️ by the open-source community.