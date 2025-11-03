# @tanstack/ai-client

Framework-agnostic headless client for TanStack AI chat functionality.

## Overview

`@tanstack/ai-client` provides a headless `ChatClient` class that manages chat state and streaming AI interactions without any framework dependencies. This makes it ideal for:

- Building custom framework integrations
- Server-side usage
- Testing and automation
- Any JavaScript/TypeScript environment

**Connection Adapters:** Flexible streaming support for SSE, HTTP streams, server functions, and more! See [CONNECTION_ADAPTERS.md](CONNECTION_ADAPTERS.md) for details.

**Note:** The backend should use `@tanstack/ai`'s `chat()` method which **automatically handles tool execution in a loop**. The client receives tool execution events via the stream.

## Connection Adapters

Connection adapters provide a flexible way to connect to different types of streaming backends.

### `fetchServerSentEvents(url, options?)`

For Server-Sent Events (SSE) format - the standard for HTTP streaming:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat", {
    headers: { "Authorization": "Bearer token" },
    credentials: "include",
  }),
});
```

**Use when:** Your backend uses `toStreamResponse()` from `@tanstack/ai`

### `fetchHttpStream(url, options?)`

For raw HTTP streaming with newline-delimited JSON:

```typescript
import { ChatClient, fetchHttpStream } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchHttpStream("/api/chat", {
    headers: { "Authorization": "Bearer token" },
  }),
});
```

**Use when:** Your backend streams newline-delimited JSON directly

### `stream(factory)`

For direct async iterables (e.g., TanStack Start server functions):

```typescript
import { ChatClient, stream } from "@tanstack/ai-client";
import { serverChatFunction } from "./server";

const client = new ChatClient({
  connection: stream((messages, data) => serverChatFunction({ messages, data })),
});
```

**Use when:** You're calling server functions directly (not via HTTP)

## Installation

```bash
pnpm add @tanstack/ai-client
# or
npm install @tanstack/ai-client
# or
yarn add @tanstack/ai-client
```

## Basic Usage

```typescript
import { ChatClient } from "@tanstack/ai-client";

// Create a client instance
const client = new ChatClient({
  api: "/api/chat",
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
  onLoadingChange: (isLoading) => {
    console.log("Loading state:", isLoading);
  },
  onErrorChange: (error) => {
    console.log("Error:", error);
  },
});

// Send a message
await client.sendMessage("Hello, AI!");

// Get current messages
const messages = client.getMessages();

// Append a message manually
await client.append({
  role: "user",
  content: "Another message",
});

// Reload the last response
await client.reload();

// Stop the current response
client.stop();

// Clear all messages
client.clear();
```

## API Reference

### `ChatClient`

The main class for managing chat interactions.

#### Constructor Options

```typescript
interface ChatClientOptions {
  // API endpoint (default: "/api/chat")
  api?: string;

  // Initial messages
  initialMessages?: UIMessage[];

  // Unique chat identifier
  id?: string;

  // Callbacks
  onResponse?: (response: Response) => void | Promise<void>;
  onChunk?: (chunk: StreamChunk) => void;
  onFinish?: (message: UIMessage) => void;
  onError?: (error: Error) => void;
  onMessagesChange?: (messages: UIMessage[]) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onErrorChange?: (error: Error | undefined) => void;

  // Request configuration
  headers?: Record<string, string> | Headers;
  body?: Record<string, any>;
  credentials?: "omit" | "same-origin" | "include";
  fetch?: typeof fetch;
}
```

#### Methods

- `sendMessage(content: string): Promise<void>` - Send a text message
- `append(message: Message | UIMessage): Promise<void>` - Append any message
- `reload(): Promise<void>` - Reload the last assistant response
- `stop(): void` - Stop the current streaming response
- `clear(): void` - Clear all messages
- `getMessages(): UIMessage[]` - Get current messages
- `getIsLoading(): boolean` - Get loading state
- `getError(): Error | undefined` - Get current error
- `setMessagesManually(messages: UIMessage[]): void` - Manually set messages

## Stream Abstraction

The package includes a transport-agnostic stream abstraction using async iterables. You can use `for await` to iterate over stream chunks:

```typescript
import { createResponseStreamSource } from '@tanstack/ai-client';

const response = await fetch('/api/chat', { method: 'POST', body: ... });
const source = createResponseStreamSource(response);

// Direct iteration
for await (const chunk of source) {
  if (chunk.type === 'content') {
    console.log('Content:', chunk.content);
  } else if (chunk.type === 'tool_call') {
    console.log('Tool call:', chunk.toolCall);
  }
}

// Or use the processStream helper
import { processStream } from '@tanstack/ai-client';

const result = await processStream(source, {
  onContent: (content) => console.log('Content:', content),
  onToolCall: (index, toolCall) => console.log('Tool call:', toolCall),
});
```

The async iterable pattern makes it easy to create custom stream sources for WebSocket, polling, or any other transport protocol. See [STREAM_ABSTRACTION.md](./STREAM_ABSTRACTION.md) for detailed examples.

## Framework Integration

This package is used by framework-specific packages like `@tanstack/ai-react`, which provide hooks and components for their respective frameworks.

### Example: Custom React Hook

```typescript
import { ChatClient } from "@tanstack/ai-client";
import { useState, useRef, useCallback } from "react";

function useCustomChat(options) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const clientRef = useRef(null);

  if (!clientRef.current) {
    clientRef.current = new ChatClient({
      ...options,
      onMessagesChange: setMessages,
      onLoadingChange: setIsLoading,
    });
  }

  const sendMessage = useCallback((content) => {
    return clientRef.current.sendMessage(content);
  }, []);

  return { messages, isLoading, sendMessage };
}
```

## Backend Example

Your backend should use `@tanstack/ai`'s `chat()` method with automatic tool execution:

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  // chat() automatically executes tools in a loop
  const stream = chat({
    adapter: openai(),
    model: "gpt-4o",
    messages,
    tools: [weatherTool], // Tools are auto-executed when called
    agentLoopStrategy: maxIterations(5), // Control loop behavior
  });

  // Stream includes tool_call and tool_result chunks
  return toStreamResponse(stream);
}
```

The client will receive:

- `content` chunks - text from the model
- `tool_call` chunks - when model calls a tool (auto-executed by SDK)
- `tool_result` chunks - results from tool execution (auto-emitted by SDK)
- `done` chunk - conversation complete

## License

MIT
