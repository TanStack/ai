# @tanstack/ai-client

Framework-agnostic headless client for TanStack AI chat functionality.

## Overview

`@tanstack/ai-client` provides a headless `ChatClient` class that manages chat state and streaming AI interactions without any framework dependencies. This makes it ideal for:

- Building custom framework integrations
- Server-side usage
- Testing and automation
- Any JavaScript/TypeScript environment

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
import { ChatClient } from '@tanstack/ai-client';

// Create a client instance
const client = new ChatClient({
  api: '/api/chat',
  onMessagesChange: (messages) => {
    console.log('Messages updated:', messages);
  },
  onLoadingChange: (isLoading) => {
    console.log('Loading state:', isLoading);
  },
  onErrorChange: (error) => {
    console.log('Error:', error);
  },
});

// Send a message
await client.sendMessage('Hello, AI!');

// Get current messages
const messages = client.getMessages();

// Append a message manually
await client.append({
  role: 'user',
  content: 'Another message',
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
  initialMessages?: ChatMessage[];
  
  // Unique chat identifier
  id?: string;
  
  // Callbacks
  onResponse?: (response: Response) => void | Promise<void>;
  onChunk?: (chunk: StreamChunk) => void;
  onFinish?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
  onMessagesChange?: (messages: ChatMessage[]) => void;
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
- `append(message: Message | ChatMessage): Promise<void>` - Append any message
- `reload(): Promise<void>` - Reload the last assistant response
- `stop(): void` - Stop the current streaming response
- `clear(): void` - Clear all messages
- `getMessages(): ChatMessage[]` - Get current messages
- `getIsLoading(): boolean` - Get loading state
- `getError(): Error | undefined` - Get current error
- `setMessagesManually(messages: ChatMessage[]): void` - Manually set messages

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
import { ChatClient } from '@tanstack/ai-client';
import { useState, useRef, useCallback } from 'react';

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

## License

MIT

