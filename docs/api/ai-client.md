---
title: "@tanstack/ai-client"
slug: /api/ai-client
order: 2
description: "API reference for @tanstack/ai-client — the framework-agnostic headless client for managing chat state and streaming transports."
keywords:
  - tanstack ai
  - "@tanstack/ai-client"
  - headless client
  - ChatClient
  - chat state
  - connection adapters
  - api reference
---

Framework-agnostic headless client for managing chat state and streaming.

## Installation

```bash
npm install @tanstack/ai-client
```

## `ChatClient`

The main client class for managing chat state.

```typescript group=chatclient
import {
  ChatClient,
  clientTools,
  fetchServerSentEvents,
  type UIMessage,
} from "@tanstack/ai-client";
import { myClientTool } from "./tools";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  initialMessages: [],
  tools: clientTools(myClientTool),
  onMessagesChange: (messages: UIMessage[]) => {
    console.log("Messages updated:", messages);
  },
});
```

### Constructor Options

- `connection` - Connection adapter for streaming
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `threadId?` - Thread ID for AG-UI run correlation. Persists across sends; auto-generated if omitted
- `forwardedProps?` - Arbitrary client-controlled JSON forwarded to the server in the AG-UI `RunAgentInput.forwardedProps` field
- `body?` - **Deprecated.** Use `forwardedProps` instead. Still works — values are merged into `forwardedProps` on the wire and mirrored under the legacy `data` field for backward compatibility
- `context?` - Typed client-local runtime context passed to client tool implementations. This value is not serialized to the server
- `tools?` - Registered `.client()` tool implementations. The client automatically executes matching tools when the model calls them
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onMessagesChange?` - Callback when messages change
- `onLoadingChange?` - Callback when loading state changes
- `onErrorChange?` - Callback when error state changes
- `streamProcessor?` - Stream processing configuration

### Methods

#### `sendMessage(content: string)`

Sends a user message and gets a response.

```typescript group=chatclient
await client.sendMessage("Hello!");
```

#### `append(message: ModelMessage | UIMessage)`

Appends a message to the conversation.

```typescript group=chatclient
await client.append({
  role: "user",
  content: "Additional context",
});
```

#### `reload()`

Reloads the last assistant message.

```typescript group=chatclient
await client.reload();
```

#### `stop()`

Stops the current response generation.

```typescript group=chatclient
client.stop();
```

#### `clear()`

Clears all messages.

```typescript group=chatclient
client.clear();
```

#### `setMessagesManually(messages: UIMessage[])`

Manually sets the messages array.

```typescript group=chatclient
const newMessages: UIMessage[] = [];
client.setMessagesManually([...newMessages]);
```

#### `addToolResult(result)`

Adds the result of a client-side tool execution.

```typescript group=chatclient
await client.addToolResult({
  toolCallId: "call_123",
  tool: "toolName",
  output: { result: "..." },
  state: "output-available",
});
```

#### `addToolApprovalResponse(response)`

Responds to a tool approval request.

```typescript group=chatclient
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

For a complete transport walkthrough, see
[Connection Adapters](../chat/connection-adapters). For React Native and Expo,
see [Quick Start: React Native](../getting-started/quick-start-react-native).

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

Creates a newline-delimited JSON HTTP stream connection adapter. Pair it with
`toHttpResponse()` on the server.

```typescript
import { fetchHttpStream } from "@tanstack/ai-client";

const adapter = fetchHttpStream("/api/chat");
```

`fetchHttpStream()` requires a runtime with streaming `fetch`,
`Response.body.getReader()`, and `TextDecoder`. If the runtime cannot expose an
incremental response body, it throws `UnsupportedResponseStreamError`; use the
XHR adapters in React Native or Expo.

### `xhrHttpStream(url, options?)`

Creates an `XMLHttpRequest`-backed newline-delimited JSON stream adapter. This
is the recommended default for React Native and Expo chat screens. Pair it with
`toHttpResponse()` on the server.

```typescript
import { xhrHttpStream } from "@tanstack/ai-client";

const adapter = xhrHttpStream("http://192.168.1.10:8787/chat/http", {
  headers: { Authorization: "Bearer token" },
  withCredentials: true,
});
```

### `xhrServerSentEvents(url, options?)`

Creates an `XMLHttpRequest`-backed SSE adapter for runtimes where XHR progress
events are more reliable than streaming `fetch`. Pair it with
`toServerSentEventsResponse()` on the server.

```typescript
import { xhrServerSentEvents } from "@tanstack/ai-client";

const adapter = xhrServerSentEvents("http://192.168.1.10:8787/chat/sse");
```

### Adapter options

Fetch adapters accept:

- `headers?: Record<string, string> | Headers`
- `credentials?: RequestCredentials`
- `signal?: AbortSignal`
- `body?: Record<string, any>`
- `fetchClient?: typeof globalThis.fetch`

XHR adapters accept:

- `headers?: Record<string, string> | Headers`
- `withCredentials?: boolean`
- `signal?: AbortSignal`
- `body?: Record<string, any>`
- `xhrFactory?: () => XMLHttpRequest`

`body` is merged into the AG-UI `forwardedProps` payload. Values from
`forwardedProps` on the client and per-message `sendMessage(..., data)` calls
override static adapter `body` values.

### Stream errors

- `UnsupportedResponseStreamError` - thrown by fetch-based adapters when
  `Response.body`, `Response.body.getReader()`, or `TextDecoder` is missing.
- `StreamTruncatedError` - thrown when an SSE or NDJSON stream ends with
  unterminated trailing data, usually because the server, proxy, or network cut
  the connection mid-line.

### `stream(connectFn)`

Creates a custom connection adapter.

```typescript ignore
import { stream } from "@tanstack/ai-client";

const adapter = stream(async (messages, data, signal) => {
  // `data` here carries the merged forwardedProps. The fetch-based
  // adapters serialize it as the AG-UI `RunAgentInput.forwardedProps`
  // field on the wire (with a backward-compat `data` mirror).
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages, forwardedProps: data }),
    signal,
  });
  return processStream(response);
});
```

## Helper Functions

### `clientTools(...tools)`

Creates a typed array of client tools with proper type inference. This eliminates the need for `as const` when defining tool arrays and enables proper discriminated union type narrowing.

```typescript
import {
  clientTools,
  createChatClientOptions,
  fetchServerSentEvents,
  type UIMessage,
} from "@tanstack/ai-client";
import { myTool1, myTool2 } from "./tools";

const messages: UIMessage[] = [];

// Create client implementations
const tool1Client = myTool1.client((input: unknown) => {
  // Implementation
  return { result: "..." };
});

const tool2Client = myTool2.client((input: unknown) => {
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
import {
  createChatClientOptions,
  clientTools,
  fetchServerSentEvents,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { tool1, tool2 } from "./tools";

const tools = clientTools(tool1, tool2);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

// Use InferChatMessages to extract message types
type ChatMessages = InferChatMessages<typeof chatOptions>;
```

`createChatClientOptions` also preserves typed client runtime context:

```typescript
import {
  createChatClientOptions,
  clientTools,
  fetchServerSentEvents,
} from "@tanstack/ai-client";
import { projectTool, runProjectAction } from "./tools";

type ClientContext = {
  activeProjectId: string;
};

const tool = projectTool.client<ClientContext>((input: unknown, ctx: { context: ClientContext }) => {
  return runProjectAction(ctx.context.activeProjectId, input);
});

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools: clientTools(tool),
  context: {
    activeProjectId: "project_123",
  },
});
```

Client runtime context is local to the client instance. Use `forwardedProps` for explicit client-to-server handoff of serializable values, then validate and map those values into server `chat({ context })`.

## Types

### `UIMessage`

```typescript ignore
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}
```

### `MessagePart`

```typescript ignore
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

```typescript ignore
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

```typescript ignore
interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  content: string;
  state: ToolResultState;
  error?: string;
}
```

### `ToolCallState`

```typescript ignore
type ToolCallState =
  | "awaiting-input"
  | "input-streaming"
  | "input-complete"
  | "approval-requested"
  | "approval-responded"
  | "complete";
```

### `ToolResultState`

```typescript ignore
type ToolResultState =
  | "streaming"
  | "complete"
  | "error";
```

## Stream Processing

Configure stream processing with chunk strategies:

```typescript
import {
  ChatClient,
  ImmediateStrategy,
  fetchServerSentEvents,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new ImmediateStrategy(), // Emit every chunk
  },
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Connection Adapters](../chat/connection-adapters) - Learn about adapters
- [@tanstack/ai-react API](./ai-react) - React hooks wrapper
