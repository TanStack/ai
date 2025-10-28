# @tanstack/ai

A powerful, open-source AI SDK with a unified interface across multiple providers. No vendor lock-in, no proprietary formats, just clean TypeScript and honest open source.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, Ollama, Google Gemini
- **Unified API** - Same interface across all providers
- **Standalone Functions** - Direct type-safe functions that infer from adapters
- **AI Class with Multiple Adapters** - Manage multiple providers with fallbacks
- **Structured Streaming** - JSON chunks with token deltas, tool calls, and usage stats
- **Tool/Function Calling** - First-class support for AI function calling (OpenAI & Anthropic)
- **React Hooks** - Simple `useChat` hook with v5 API (you control input state)
- **TypeScript First** - Full type safety throughout
- **Zero Lock-in** - Switch providers at runtime without code changes

## Quick Start

### Standalone Functions (Recommended for Simple Use Cases)

The easiest way to use the SDK - just pass an adapter and get full type inference:

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Type-safe chat with automatic inference from adapter
const result = await chat({
  adapter: openai(), // Automatically uses OPENAI_API_KEY from env
  model: "gpt-4", // <-- Autocompletes with OpenAI models
  messages: [{ role: "user", content: "Hello!" }],
  providerOptions: { // <-- Typed as OpenAI-specific options!
    reasoningEffort: "high",
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
- `chat()` - Chat completion
- `chatStream()` - Streaming chat with AsyncIterable
- `summarize()` - Text summarization
- `embed()` - Generate embeddings
- `image()` - Image generation
- `audio()` - Audio transcription
- `speak()` - Text-to-speech
- `video()` - Video generation

### AI Class (For Reusable Instances with Tools)

For applications that need to register tools or system prompts once and reuse them:

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

// Create an AI instance with tools and system prompts
const aiInstance = ai(openai(), {
  tools: {
    getWeather: tool({
      type: "function",
      function: {
        name: "getWeather",
        description: "Get weather for a location",
        parameters: { /* ... */ }
      },
      execute: async (args) => { /* ... */ }
    })
  },
  systemPrompts: ["You are a helpful assistant."]
});

// Use the instance - tools and system prompts are automatically included
await aiInstance.chat({
  model: "gpt-4",
  messages: [{ role: "user", content: "What's the weather?" }],
  tools: ["getWeather"], // Reference by name
});
```

**Why use the AI class?**
- ✅ **Tools Registry** - Register tools once, use everywhere
- ✅ **System Prompts** - Set default system prompts
- ✅ **Reusable** - Configure once, use many times
- ✅ **Adapter Switching** - Use `setAdapter()` to switch providers

Choose the approach that fits your needs - both offer full type safety!

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

## Architecture

### Core Concepts

**1. Provider-Agnostic Design**

All providers implement the same `AIAdapter` interface:

```typescript
interface AIAdapter {
  // Chat
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  chatStream(options: ChatCompletionOptions): AsyncIterable<StreamChunk>;

  // Text generation
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;

  // Summarization
  summarize(options: SummarizationOptions): Promise<SummarizationResult>;

  // Embeddings
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>;
}
```

**2. Structured Streaming**

Streams return typed JSON chunks instead of raw strings:

```typescript
type StreamChunk =
  | ContentStreamChunk // Text tokens with delta + accumulated content
  | ToolCallStreamChunk // Function call information
  | DoneStreamChunk // Completion signal with token usage
  | ErrorStreamChunk; // Error information
```

**3. Adapter Pattern**

The `AI` class wraps any adapter and provides a consistent API:

```typescript
const ai = new AI(adapter); // Initialize with adapter
await ai.chat(options); // Standard chat
ai.streamChat(options); // Structured streaming
ai.setAdapter(newAdapter); // Switch providers
```

## API Reference

### Core Library

#### AI Class

**Constructor**

```typescript
constructor(adapter: AIAdapter)
```

Create an AI instance with a specific provider adapter.

#### Methods

##### `chat(options): Promise<ChatCompletionResult>`

Non-streaming chat completion.

```typescript
const result = await ai.chat({
  model: "gpt-3.5-turbo",
  messages: [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello!" },
  ],
  temperature: 0.7,
  maxTokens: 1000,
});

console.log(result.content);
console.log(result.usage.totalTokens);
```

##### `streamChat(options): AsyncIterable<StreamChunk>`

Structured streaming with JSON chunks. **Automatically executes tools** if they have `execute` functions.

```typescript
for await (const chunk of ai.streamChat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Hello" }],
  tools: [...],            // Optional: Tools with execute functions
  toolChoice: "auto",      // Optional: "auto" | "none" | { type, function }
  maxIterations: 5,        // Optional: Max tool calling loops (default: 5)
})) {
  switch (chunk.type) {
    case "content":
      console.log("Delta:", chunk.delta);
      console.log("Full:", chunk.content);
      break;
    case "tool_call":
      console.log("Tool:", chunk.toolCall.function.name);
      console.log("Args:", chunk.toolCall.function.arguments);
      // Tool is executed automatically if execute function is defined!
      break;
    case "done":
      console.log("Finish:", chunk.finishReason);
      console.log("Usage:", chunk.usage);
      break;
    case "error":
      console.error("Error:", chunk.error.message);
      break;
  }
}
```

**Automatic Tool Execution:** If tools have `execute` functions, `streamChat` will:

1. Detect tool calls from the AI
2. Execute the tools automatically
3. Add results to the conversation
4. Continue streaming the final response
5. Repeat up to `maxIterations` times

##### `generateText(options): Promise<TextGenerationResult>`

Generate text from a prompt.

```typescript
const result = await ai.generateText({
  model: "gpt-3.5-turbo-instruct",
  prompt: "Once upon a time",
  maxTokens: 100,
});

console.log(result.text);
```

##### `summarize(options): Promise<SummarizationResult>`

Summarize text.

```typescript
const result = await ai.summarize({
  model: "gpt-3.5-turbo",
  text: "Long text to summarize...",
  style: "bullet-points", // "bullet-points" | "paragraph" | "concise"
  maxLength: 200,
});

console.log(result.summary);
```

##### `embed(options): Promise<EmbeddingResult>`

Generate embeddings.

```typescript
const result = await ai.embed({
  model: "text-embedding-ada-002",
  input: ["Text 1", "Text 2"],
});

console.log(result.embeddings); // number[][]
```

##### `setAdapter(adapter): void`

Switch providers at runtime.

```typescript
ai.setAdapter(new AnthropicAdapter({ apiKey: "..." }));
```

#### Helper Functions

##### `toStreamResponse(stream): Response`

Convert a `StreamChunk` async iterable to an HTTP Response with proper SSE headers.

```typescript
import { toStreamResponse } from "@tanstack/ai";

const stream = ai.streamChat({ model, messages });
return toStreamResponse(stream);
```

Returns a `Response` with:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- Automatic JSON encoding of chunks
- Error handling
- `[DONE]` completion marker

##### `toReadableStream(stream): ReadableStream`

Convert a `StreamChunk` async iterable to a `ReadableStream` for more control.

```typescript
import { toReadableStream } from "@tanstack/ai";

const stream = ai.streamChat({ model, messages });
const readableStream = toReadableStream(stream);

// Use in custom Response
return new Response(readableStream, {
  headers: { "Custom-Header": "value" },
});
```

### Types

#### Message

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCalls?: ToolCall[]; // For assistant messages with tool calls
  toolCallId?: string; // For tool response messages
}
```

#### Tool

```typescript
interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
  execute?: (args: any) => Promise<string> | string; // Optional: auto-execute
}
```

**Note:** If `execute` is provided, `streamChat` will automatically:

1. Detect when the AI calls this tool
2. Execute the function with the parsed arguments
3. Add the result back to the conversation
4. Continue streaming the final response

#### StreamChunk Variants

**ContentStreamChunk**

```typescript
{
  type: "content"
  id: string
  model: string
  timestamp: number
  delta: string           // New token(s)
  content: string         // Full accumulated content
  role?: "assistant"
}
```

**ToolCallStreamChunk**

```typescript
{
  type: "tool_call"
  id: string
  model: string
  timestamp: number
  toolCall: {
    id: string
    type: "function"
    function: {
      name: string
      arguments: string   // Incremental JSON arguments
    }
  }
  index: number
}
```

**DoneStreamChunk**

```typescript
{
  type: "done"
  id: string
  model: string
  timestamp: number
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
```

**ErrorStreamChunk**

```typescript
{
  type: "error"
  id: string
  model: string
  timestamp: number
  error: {
    message: string
    code?: string
  }
}
```

### React Hooks

#### useChat

The `useChat` hook provides complete chat functionality for React applications.

```typescript
import { useChat } from "@tanstack/ai-react";

const {
  messages, // Current message list
  sendMessage, // Send a message (you manage input state)
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

// Simple usage
await sendMessage("Hello!");
```

**Key Features:**

- Maintains message state automatically
- Sends messages to your API endpoint
- Parses streaming `StreamChunk` responses
- Updates messages in real-time
- You control input state (v5 API style)

See `packages/ai-react/README.md` for full documentation and backend examples.

## Advanced Usage

### Automatic Tool Calling

Define tools with `execute` functions and `streamChat` handles everything automatically:

```typescript
import type { Tool } from "@tanstack/ai";

const tools: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name" },
        },
        required: ["location"],
      },
    },
    execute: async ({ location }: { location: string }) => {
      const weather = await fetchWeather(location);
      return JSON.stringify(weather);
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform calculations",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string" },
        },
        required: ["expression"],
      },
    },
    execute: async ({ expression }: { expression: string }) => {
      const result = eval(expression);
      return JSON.stringify({ result });
    },
  },
];

// Tools are executed automatically!
for await (const chunk of ai.streamChat({
  model: "gpt-3.5-turbo",
  messages: [
    { role: "user", content: "What's the weather in Paris and what's 2+2?" },
  ],
  tools,
  toolChoice: "auto",
  maxIterations: 5, // Limit tool calling loops (default: 5)
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  }
  // Tools are called and executed automatically - no manual handling needed!
}
```

**Key Features:**

- ✅ Define `execute` function with each tool
- ✅ `streamChat` automatically detects tool calls
- ✅ Executes tools automatically
- ✅ Adds results back to conversation
- ✅ Continues until final response (up to `maxIterations`)
- ✅ You just handle the stream - no manual tool logic!

### Backend Helper - toStreamResponse

Convert streaming responses to HTTP responses with one line:

```typescript
import { AI, toStreamResponse } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

const ai = new AI(new OpenAIAdapter({ apiKey: "..." }));

// Express/Node.js
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  const stream = ai.streamChat({
    model: "gpt-3.5-turbo",
    messages,
    tools, // Optional
  });

  // One line to convert to HTTP response!
  return toStreamResponse(stream);
});

// Next.js App Router
export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = ai.streamChat({
    model: "gpt-3.5-turbo",
    messages,
  });

  return toStreamResponse(stream);
}

// TanStack Start
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        return toStreamResponse(
          ai.streamChat({ model: "gpt-3.5-turbo", messages })
        );
      },
    },
  },
});
```

The helper handles:

- ✅ Server-Sent Events formatting
- ✅ Proper headers (Content-Type, Cache-Control, Connection)
- ✅ JSON encoding of chunks
- ✅ Error handling and error chunks
- ✅ Completion marker `[DONE]`

### Provider-Specific Configuration

Each adapter accepts its own configuration:

```typescript
// OpenAI
new OpenAIAdapter({
  apiKey: string,
  organization: string,
  baseURL: string,
  timeout: number,
  maxRetries: number,
});

// Anthropic
new AnthropicAdapter({
  apiKey: string,
  baseUrl: string,
  timeout: number,
  maxRetries: number,
});

// Ollama (local)
new OllamaAdapter({
  host: string, // Default: "http://localhost:11434"
});

// Gemini
new GeminiAdapter({
  apiKey: string,
});
```

## Examples

### Basic Chat

```typescript
import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

const ai = new AI(new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }));

const response = await ai.chat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Explain quantum computing" }],
});

console.log(response.content);
```

### Streaming

```typescript
for await (const chunk of ai.streamChat({
  model: "gpt-3.5-turbo",
  messages: [{ role: "user", content: "Tell me a story" }],
})) {
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
// Start with OpenAI
const ai = new AI(new OpenAIAdapter({ apiKey: "..." }));

// Switch to Anthropic - same code works!
ai.setAdapter(new AnthropicAdapter({ apiKey: "..." }));
const response = await ai.chat({ model: "claude-3-sonnet-20240229", messages });

// Switch to local Ollama
ai.setAdapter(new OllamaAdapter());
const response2 = await ai.chat({ model: "llama2", messages });
```

### Text Generation

```typescript
const result = await ai.generateText({
  model: "gpt-3.5-turbo-instruct",
  prompt: "Write a haiku about TypeScript",
  maxTokens: 50,
});

console.log(result.text);
```

### Summarization

```typescript
const longText = `...`; // Your long text

const summary = await ai.summarize({
  model: "gpt-3.5-turbo",
  text: longText,
  style: "bullet-points",
  maxLength: 300,
});

console.log(summary.summary);
```

### Embeddings

```typescript
const result = await ai.embed({
  model: "text-embedding-ada-002",
  input: "Semantic search query",
});

const vector = result.embeddings[0]; // number[]
console.log(`Dimensions: ${vector.length}`);
```

### React Hook - useChat

Build chat interfaces with the `useChat` hook:

```typescript
import { useChat } from "@tanstack/ai-react";

function ChatComponent() {
  const { messages, sendMessage, isLoading, error } = useChat({
    api: "/api/chat",
  });

  const [input, setInput] = useState("");

  return (
    <div>
      {/* Message list */}
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong> {message.content}
        </div>
      ))}

      {/* Input - you control the state */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            sendMessage(input);
            setInput("");
          }
        }}
        placeholder="Type a message..."
        disabled={isLoading}
      />
      <button
        onClick={() => {
          sendMessage(input);
          setInput("");
        }}
        disabled={isLoading || !input.trim()}
      >
        {isLoading ? "Sending..." : "Send"}
      </button>

      {error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

The hook handles:

- Message state management
- Sending messages to your API endpoint
- Streaming response parsing
- Loading and error states
- Automatic message updates as chunks arrive

**You control the input** - the hook only manages message state and API communication.

## Examples

### Standalone Scripts

```bash
# Install and build
pnpm install && pnpm build

# Run examples (set API keys first)
cd examples

# See basic usage of all providers
pnpm quick-start

# See streaming in action
pnpm streaming-demo

# See tool calling with both OpenAI & Anthropic (same code!)
pnpm tool-calling
```

**Note:** Set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` environment variables to see the examples work with real API calls.

### Full TanStack Start Application

A complete chat application with tool calling, built with TanStack Start and our React hooks:

```bash
cd examples/ts-chat

# Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Install and run
pnpm install
pnpm dev
```

Open http://localhost:3000/demo/tanchat to see:

- Real-time streaming chat with Claude
- Tool calling for guitar recommendations
- Beautiful UI with markdown formatting
- All powered by `@tanstack/ai-react`

### Interactive CLI

We provide a full-featured CLI for testing and demos:

```bash
# Interactive chat
pnpm cli chat --provider openai

# Tool calling demo (OpenAI & Anthropic)
pnpm cli tools --provider openai
pnpm cli tools --provider anthropic

# See JSON stream chunks
pnpm cli chat --provider openai --debug

# Other commands
pnpm cli generate --provider anthropic --prompt "..."
pnpm cli summarize --provider gemini --text "..." --style concise
pnpm cli embed --provider openai --text "..."
```

See `examples/cli/README.md` for full CLI documentation.

## Package Structure

```
@tanstack/ai/
├── packages/
│   ├── ai/                  # Core library
│   │   ├── types.ts         # Type definitions
│   │   ├── ai.ts            # Main AI class
│   │   ├── base-adapter.ts  # Adapter base class
│   │   └── stream-utils.ts  # Streaming utilities
│   ├── ai-openai/           # OpenAI adapter
│   ├── ai-anthropic/        # Anthropic adapter
│   ├── ai-ollama/           # Ollama adapter
│   ├── ai-gemini/           # Google Gemini adapter
│   └── ai-react/            # React hooks
│       ├── use-chat.ts      # Chat hook
│       └── types.ts         # React-specific types
└── examples/
    ├── cli/                 # Interactive CLI demo
    ├── ts-chat/             # TanStack Start full app
    ├── quick-start.js       # Basic examples
    ├── streaming-demo.js    # Streaming demo
    └── tool-calling-example.js # Tool calling demo
```

## Provider Support Matrix

| Feature         | OpenAI | Anthropic | Ollama | Gemini |
| --------------- | ------ | --------- | ------ | ------ |
| Chat            | ✅     | ✅        | ✅     | ✅     |
| Streaming       | ✅     | ✅        | ✅     | ✅     |
| Tool Calling    | ✅     | ✅        | ⏳     | ⏳     |
| Text Generation | ✅     | ✅        | ✅     | ✅     |
| Summarization   | ✅     | ✅        | ✅     | ✅     |
| Embeddings      | ✅     | ❌        | ✅     | ✅     |

✅ = Fully supported | ⏳ = Planned | ❌ = Not supported by provider

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
