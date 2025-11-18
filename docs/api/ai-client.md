# @tanstack/ai-client API

Framework-agnostic headless client for managing chat state and streaming.

## Installation

```bash
npm install @tanstack/ai-client
```

## `ChatClient`

The main client class for managing chat state.

```typescript
import { ChatClient } from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  initialMessages: [],
  onMessagesChange: (messages) => {
    console.log("Messages updated:", messages);
  },
  onToolCall: async ({ toolName, input }) => {
    // Handle client tool execution
    return { result: "..." };
  },
});
```

### Constructor Options

- `connection` - Connection adapter for streaming
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `body?` - Additional body parameters to send
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onMessagesChange?` - Callback when messages change
- `onLoadingChange?` - Callback when loading state changes
- `onErrorChange?` - Callback when error state changes
- `onToolCall?` - Callback for client-side tool execution
- `streamProcessor?` - Stream processing configuration

### Methods

#### `sendMessage(content: string)`

Sends a user message and gets a response.

```typescript
await client.sendMessage("Hello!");
```

#### `append(message: ModelMessage | UIMessage)`

Appends a message to the conversation.

```typescript
await client.append({
  role: "user",
  content: "Additional context",
});
```

#### `reload()`

Reloads the last assistant message.

```typescript
await client.reload();
```

#### `stop()`

Stops the current response generation.

```typescript
client.stop();
```

#### `clear()`

Clears all messages.

```typescript
client.clear();
```

#### `setMessagesManually(messages: UIMessage[])`

Manually sets the messages array.

```typescript
client.setMessagesManually([...newMessages]);
```

#### `addToolResult(result)`

Adds the result of a client-side tool execution.

```typescript
await client.addToolResult({
  toolCallId: "call_123",
  tool: "toolName",
  output: { result: "..." },
  state: "output-available",
});
```

#### `addToolApprovalResponse(response)`

Responds to a tool approval request.

```typescript
await client.addToolApprovalResponse({
  id: "approval_123",
  approved: true,
});
```

### Properties

- `messages: UIMessage[]` - Current messages
- `isLoading: boolean` - Whether a response is being generated
- `error: Error | undefined` - Current error, if any

## Connection Adapters

### `fetchServerSentEvents(url, options?)`

Creates an SSE connection adapter.

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-client";

const adapter = fetchServerSentEvents("/api/chat", {
  headers: {
    Authorization: "Bearer token",
  },
});
```

### `fetchHttpStream(url, options?)`

Creates an HTTP stream connection adapter.

```typescript
import { fetchHttpStream } from "@tanstack/ai-client";

const adapter = fetchHttpStream("/api/chat");
```

### `stream(connectFn)`

Creates a custom connection adapter.

```typescript
import { stream } from "@tanstack/ai-client";

const adapter = stream(async (messages, data, signal) => {
  // Custom implementation
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages, ...data }),
    signal,
  });
  return processStream(response);
});
```

## Types

### `UIMessage`

```typescript
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}
```

### `MessagePart`

```typescript
type MessagePart = TextPart | ToolCallPart | ToolResultPart;
```

### `TextPart`

```typescript
interface TextPart {
  type: "text";
  content: string;
}
```

### `ToolCallPart`

```typescript
interface ToolCallPart {
  type: "tool-call";
  id: string;
  name: string;
  arguments: string;
  state: ToolCallState;
  approval?: ApprovalRequest;
  output?: any;
}
```

### `ToolResultPart`

```typescript
interface ToolResultPart {
  type: "tool-result";
  id: string;
  toolCallId: string;
  tool: string;
  output: any;
  state: ToolResultState;
  errorText?: string;
}
```

### `ToolCallState`

```typescript
type ToolCallState =
  | "pending"
  | "approval-requested"
  | "executing"
  | "output-available"
  | "output-error"
  | "cancelled";
```

### `ToolResultState`

```typescript
type ToolResultState =
  | "pending"
  | "executing"
  | "output-available"
  | "output-error";
```

## Stream Processing

Configure stream processing with chunk strategies:

```typescript
import { ImmediateStrategy } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new ImmediateStrategy(), // Emit every chunk
  },
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Connection Adapters](../guides/connection-adapters) - Learn about adapters
- [@tanstack/ai-react API](./ai-react) - React hooks wrapper

