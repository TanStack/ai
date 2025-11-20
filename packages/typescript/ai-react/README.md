# @tanstack/ai-react

React hooks for building AI chat interfaces with TanStack AI.

## Installation

```bash
npm install @tanstack/ai-react @tanstack/ai-client
```

## useChat Hook

The `useChat` hook manages chat state, handles streaming responses, and provides a complete chat interface in a single hook.

**Design Philosophy (v5 API):**

- You control input state
- Just call `sendMessage()` when ready
- No form-centric API - use buttons, keyboard events, or any trigger
- More flexible and less opinionated

### Basic Usage

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useState } from "react";

function ChatComponent() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const [input, setInput] = useState("");

  const handleSend = () => {
    sendMessage(input);
    setInput("");
  };

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        disabled={isLoading}
      />
      <button onClick={handleSend} disabled={isLoading || !input.trim()}>
        Send
      </button>
    </div>
  );
}
```

### API

#### Options

```typescript
interface UseChatOptions {
  // Connection adapter (required)
  connection: ConnectionAdapter;
  
  // Configuration
  initialMessages?: UIMessage[]; // Starting messages
  id?: string; // Unique chat ID
  body?: Record<string, any>; // Extra data to send
  
  // Callbacks
  onResponse?: (response?: Response) => void;
  onChunk?: (chunk: StreamChunk) => void;
  onFinish?: (message: UIMessage) => void;
  onError?: (error: Error) => void;
}
```

#### Return Value

```typescript
interface UseChatReturn {
  messages: UIMessage[]; // Current conversation
  sendMessage: (content: string) => Promise<void>; // Send a message
  append: (message) => Promise<void>; // Add message programmatically
  reload: () => Promise<void>; // Reload last response
  stop: () => void; // Stop current generation
  isLoading: boolean; // Is generating a response
  error: Error | undefined; // Current error
  setMessages: (messages) => void; // Set messages manually
  clear: () => void; // Clear all messages
}
```

## Connection Adapters

Connection adapters provide flexible streaming for different scenarios. See the complete guides:

- 📖 [Connection Adapters Guide](../../docs/CONNECTION_ADAPTERS_GUIDE.md) - Complete guide with examples
- 📖 [Connection Adapters API](../ai-client/CONNECTION_ADAPTERS.md) - API reference

### Quick Examples

**SSE (Most Common):**
```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const chat = useChat({
  connection: fetchServerSentEvents("/api/chat"),
});
```

**Server Functions:**
```typescript
import { useChat, stream } from "@tanstack/ai-react";

const chat = useChat({
  connection: stream((messages) => serverChatFunction({ messages })),
});
```

**Custom (e.g., WebSockets):**
```typescript
import { useChat } from "@tanstack/ai-react";
import type { ConnectionAdapter } from "@tanstack/ai-client";

const wsAdapter: ConnectionAdapter = {
  async *connect(messages) {
    // Your WebSocket logic
  },
};

const chat = useChat({ connection: wsAdapter });
```

### Backend Endpoint

Your backend should use the `chat()` method which **automatically handles tool execution in a loop**:

1. Receive POST requests with this body:

```typescript
{
  messages: Message[];
  data?: Record<string, any>;
}
```

2. Use `chat()` to stream responses (with automatic tool execution):

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
    tools: [weatherTool], // Optional: auto-executed in loop
    agentLoopStrategy: maxIterations(5), // Optional: control loop
  });

  // Convert to HTTP streaming response with SSE headers
  return toStreamResponse(stream);
}
```

The response streams `StreamChunk` objects as Server-Sent Events:

```
data: {"type":"content","delta":"Hello","content":"Hello",...}
data: {"type":"tool_call","toolCall":{...},...}
data: {"type":"tool_result","toolCallId":"...","content":"...",...}
data: {"type":"content","delta":" world","content":"Hello world",...}
data: {"type":"done","finishReason":"stop","usage":{...}}
```

**Note:** The `chat()` method automatically executes tools and emits `tool_result` chunks - you don't need to handle tool execution manually!

### Advanced Usage

#### With Callbacks

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onChunk: (chunk) => {
    if (chunk.type === "content") {
      console.log("New token:", chunk.delta);
    }
  },
  onFinish: (message) => {
    console.log("Final message:", message);
    // Save to database, log analytics, etc.
  },
  onError: (error) => {
    console.error("Chat error:", error);
    // Show toast notification, log error, etc.
  },
});

// Send messages programmatically
await sendMessage("Tell me a joke");
```

#### Flexible Triggering

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { sendMessage, isLoading } = useChat({ 
  connection: fetchServerSentEvents("/api/chat") 
});
const [input, setInput] = useState("");

// Button click
<button onClick={() => sendMessage(input)}>Send</button>

// Enter key
<input onKeyDown={(e) => e.key === "Enter" && sendMessage(input)} />

// Voice input
<button onClick={async () => {
  const transcript = await voiceToText();
  sendMessage(transcript);
}}>🎤 Speak</button>

// Predefined prompts
<button onClick={() => sendMessage("Explain quantum computing")}>
  Ask about quantum computing
</button>
```

#### With Custom Headers

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const chat = useChat({
  connection: fetchServerSentEvents("/api/chat", {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Custom-Header": "value",
    },
  }),
  body: {
    userId: "123",
    sessionId: "abc",
  },
});
```

#### Programmatic Control

```typescript
const { messages, sendMessage, append, reload, stop, clear } = useChat();

// Send a simple message
await sendMessage("Hello!");

// Add a message with more control
await append({
  role: "user",
  content: "Hello!",
  id: "custom-id",
});

// Reload the last AI response
await reload();

// Stop the current generation
stop();

// Clear all messages
clear();
```

#### Multiple Chats

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function App() {
  const chat1 = useChat({ 
    id: "chat-1", 
    connection: fetchServerSentEvents("/api/chat") 
  });
  const chat2 = useChat({ 
    id: "chat-2", 
    connection: fetchServerSentEvents("/api/chat") 
  });

  // Each hook manages independent state
}
```

## Example Backend (Node.js/Express)

```typescript
import express from "express";
import { AI, toStreamResponse } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

const app = express();
app.use(express.json());

const ai = new AI(new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }));

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  // One line to create streaming response!
  const stream = ai.streamChat({
    model: "gpt-3.5-turbo",
    messages,
  });

  const response = toStreamResponse(stream);

  // Copy headers and stream to Express response
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
});

app.listen(3000);
```

## Example Backend (Next.js App Router)

```typescript
// app/api/chat/route.ts
import { AI, toStreamResponse } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

export const runtime = "edge";

const ai = new AI(new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }));

export async function POST(req: Request) {
  const { messages } = await req.json();

  // One line!
  return toStreamResponse(
    ai.streamChat({
      model: "gpt-3.5-turbo",
      messages,
    })
  );
}
```

## Example Backend (TanStack Start)

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { AI, toStreamResponse } from "@tanstack/ai";
import { AnthropicAdapter } from "@tanstack/ai-anthropic";

const ai = new AI(
  new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY })
);

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        // One line with automatic tool execution!
        return toStreamResponse(
          ai.streamChat({
            model: "claude-3-5-sonnet-20241022",
            messages,
            tools, // Tools with execute functions
          })
        );
      },
    },
  },
});
```

## TypeScript Types

All types are fully exported:

```typescript
import type {
  UIMessage,
  UseChatOptions,
  UseChatReturn,
  ChatRequestBody,
} from "@tanstack/ai-react";
```

## Features

- ✅ Automatic message state management
- ✅ Streaming response handling
- ✅ Loading and error states
- ✅ Simple `sendMessage()` API (v5 style)
- ✅ You control input state (flexible)
- ✅ Abort/stop generation
- ✅ Reload last response
- ✅ Clear conversation
- ✅ Custom headers and body data (via connection adapter options)
- ✅ Callback hooks for lifecycle events
- ✅ Multiple concurrent chats
- ✅ Full TypeScript support

## License

MIT
