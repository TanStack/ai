---
title: TanStack AI Client API
slug: /api/ai-client
---

Framework-agnostic headless client for managing chat state and streaming.

## Installation

```bash
npm install @tanstack/ai-client
```

## `ChatClient`

The main client class for managing chat state.

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

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

## Helper Functions

### `clientTools(...tools)`

Creates a typed array of client tools with proper type inference. This eliminates the need for `as const` when defining tool arrays and enables proper discriminated union type narrowing.

```typescript
import { clientTools } from "@tanstack/ai-client";
import { myTool1, myTool2 } from "./tools";

// Create client implementations
const tool1Client = myTool1.client((input) => {
  // Implementation
  return { result: "..." };
});

const tool2Client = myTool2.client((input) => {
  // Implementation
  return { result: "..." };
});

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(tool1Client, tool2Client);

// Now when you use these tools in chat options:
const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools, // Fully typed with literal tool names
});

// In your component:
messages.forEach((message) => {
  message.parts.forEach((part) => {
    if (part.type === "tool-call" && part.name === "myTool1") {
      // ✅ TypeScript knows part.name is literally "myTool1"
      // ✅ part.input is typed from myTool1's input schema
      // ✅ part.output is typed from myTool1's output schema
    }
  });
});
```

### `createChatClientOptions(options)`

Helper function to create typed chat client options with proper type inference.

```typescript
import { createChatClientOptions, clientTools } from "@tanstack/ai-client";

const tools = clientTools(tool1, tool2);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Use InferChatMessages to extract message types
type ChatMessages = InferChatMessages<typeof chatOptions>;
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
type MessagePart = TextPart | ThinkingPart | ToolCallPart | ToolResultPart;
```

### `TextPart`

```typescript
interface TextPart {
  type: "text";
  content: string;
}
```

### `ThinkingPart`

```typescript
interface ThinkingPart {
  type: "thinking";
  content: string;
}
```

Thinking parts represent the model's internal reasoning process. They are typically displayed in a collapsible format and automatically collapse when the response text appears. Thinking parts are UI-only and are not sent back to the model in subsequent requests.

**Note:** Thinking parts are only available when using models that support reasoning/thinking (e.g., Anthropic Claude with thinking enabled, OpenAI GPT-5 with reasoning enabled).

### `ToolCallPart`

```typescript
interface ToolCallPart {
  type: "tool-call";
  id: string;
  name: string;
  arguments: string; // JSON string (may be incomplete during streaming)
  input?: any; // Parsed tool input (typed from tool's inputSchema)
  state: ToolCallState;
  approval?: ApprovalRequest;
  output?: any; // Tool execution output (typed from tool's outputSchema)
}
```

When using typed tools with `clientTools()` and `createChatClientOptions()`, the `input` and `output` fields are automatically typed based on your tool's Zod schemas, and `name` becomes a discriminated union enabling type narrowing.

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
import { ImmediateStrategy, fetchServerSentEvents } from "@tanstack/ai-client";

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
