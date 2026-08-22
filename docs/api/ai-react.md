---
title: "@tanstack/ai-react"
slug: /api/ai-react
order: 3
description: "API reference for @tanstack/ai-react — React hooks including useChat for streaming chat with full type safety in React apps."
keywords:
  - tanstack ai
  - "@tanstack/ai-react"
  - react
  - useChat
  - react hooks
  - api reference
---

React hooks for TanStack AI, providing convenient React bindings for the headless client.
For React Native, the documented support surface is narrow: `useChat` with chat
connection adapters. React DOM-specific UI packages and TanStack AI devtools UI
are not part of the React Native support surface.

For a complete native journey, see
[Quick Start: React Native](../getting-started/quick-start-react-native).

## Installation

```bash
npm install @tanstack/ai-react
```

## `useChat(options?)`

Main hook for managing chat state in React with full type safety.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { useState } from "react";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Update the UI with a notification",
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

function ChatComponent() {
  const [notification, setNotification] = useState<string | null>(null);

  // Create client tool implementations
  const updateUI = updateUIDef.client((input) => {
    setNotification(input.message);
    return { success: true };
  });

  // Create typed tools array (no 'as const' needed!)
  const tools = [updateUI];

  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
  });

  // Fully typed messages!
  type ChatMessages = InferChatMessages<typeof chatOptions>;

  const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
    useChat(chatOptions);

  return <div>{/* Chat UI with typed messages */}</div>;
}
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client`:

- `connection` - Connection adapter (required)
- `tools?` - Array of client tool implementations (with `.client()` method)
- `initialMessages?` - Initial messages array
- `threadId?` - The only identity for this chat. Required when persistence is on. If omitted, minted after mount.
- `forwardedProps?` - Arbitrary client-controlled JSON forwarded to the server in the AG-UI `RunAgentInput.forwardedProps` field (e.g., `{ provider: 'openai', model: 'gpt-5.5' }`)
- `body?` - **Deprecated.** Use `forwardedProps` instead. Still works for backward compatibility; values are merged into `forwardedProps` on the wire
- `byok?` - Optional BYOK keyring from `defineByok`. On each send the client prepares the resolved provider and stamps `x-byok-*` request headers. Keys never go in the body
- `byokProvider?` - Optional function that returns the provider slug for this chat. If it returns a slug, only that key is prepared and sent. Otherwise `forwardedProps.provider` then `body.provider` are used. If no slug resolves, the send throws instead of attaching every stored key
- `context?` - Typed client-local runtime context passed to client tool implementations. This value is not serialized to the server
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onInterruptStateChange?` - Callback when interrupt state changes; context source is `hydrate` for restored state and `live` for streamed or client-initiated updates
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
import type { UIMessage } from "@tanstack/ai-react";
import type { ModelMessage } from "@tanstack/ai";

interface UseChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string) => Promise<void>;
  append: (message: ModelMessage | UIMessage) => Promise<void>;
  addToolResult: (result: {
    toolCallId: string;
    tool: string;
    output: any;
    state?: "output-available" | "output-error";
    errorText?: string;
  }) => Promise<void>;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => Promise<void>;
  reload: () => Promise<void>;
  stop: () => void;
  isLoading: boolean;
  error: Error | undefined;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
}
```

## `useByok(client)`

Subscribe to a `ByokClient` snapshot in React.

```tsx
import { useByok } from "@tanstack/ai-react";
import { byok } from "./byok";

export function KeyStatus() {
  const snapshot = useByok(byok);
  const openai = snapshot.status.openai;
  const last4 = openai && "masked" in openai ? openai.masked : "No key";
  return <p>{last4}</p>;
}
```

`snapshot` has `status`, `locked`, and `prompt`. Call `byok.update(provider, value)` from your own UI to save a key. See [Bring Your Own Key](../advanced/byok).

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrServerSentEvents,
  xhrHttpStream,
  stream,
  type ConnectionAdapter,
  type FetchConnectionOptions,
  type XhrConnectionOptions,
} from "@tanstack/ai-react";
```

For React Native or Expo chat screens, use an absolute server URL and prefer
`xhrHttpStream()` with a server route that returns `toHttpResponse()`. Use
`xhrServerSentEvents()` with `toServerSentEventsResponse()` when you want SSE.
Use `fetchHttpStream()` only when the runtime supports streaming `fetch`,
`Response.body.getReader()`, and `TextDecoder`; otherwise it throws
`UnsupportedResponseStreamError`.

XHR adapter options include `headers`, `withCredentials`, `signal`, `body`, and
`xhrFactory`. Fetch adapter options include `headers`, `credentials`, `signal`,
`body`, and `fetchClient`. Both option objects may be provided directly or as a
function that resolves per request.

For error narrowing, import `UnsupportedResponseStreamError` and
`StreamTruncatedError` from `@tanstack/ai-client`.

## Example: Basic Chat

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput("");
    }
  };

  return (
    <div>
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts.map((part, idx) => {
              if (part.type === "thinking") {
                return (
                  <div key={idx} className="text-sm text-gray-500 italic">
                    💭 Thinking: {part.content}
                  </div>
                );
              }
              if (part.type === "text") {
                return <span key={idx}>{part.content}</span>;
              }
              return null;
            })}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## Example: Tool Approval

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function ChatWithApproval() {
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      {messages.map((message) =>
        message.parts.map((part) => {
          if (
            part.type === "tool-call" &&
            part.state === "approval-requested" &&
            part.approval
          ) {
            return (
              <div key={part.id}>
                <p>Approve: {part.name}</p>
                <button
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval!.id,
                      approved: true,
                    })
                  }
                >
                  Approve
                </button>
                <button
                  onClick={() =>
                    addToolApprovalResponse({
                      id: part.approval!.id,
                      approved: false,
                    })
                  }
                >
                  Deny
                </button>
              </div>
            );
          }
          return null;
        })
      )}
    </div>
  );
}
```

## Example: Client Tools with Type Safety

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { useState } from "react";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Update the UI with a notification",
  inputSchema: z.object({
    message: z.string(),
    type: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
});

const saveToStorageDef = toolDefinition({
  name: "saveToStorage",
  description: "Save a value to storage",
  inputSchema: z.object({
    key: z.string(),
    value: z.string(),
  }),
  outputSchema: z.object({ saved: z.boolean() }),
});

export function ChatWithClientTools() {
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);

  // Create client implementations
  const updateUI = updateUIDef.client((input) => {
    // ✅ input is fully typed!
    setNotification({ message: input.message, type: input.type });
    return { success: true };
  });

  const saveToStorage = saveToStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  // Create typed tools array (no 'as const' needed!)
  const tools = [updateUI, saveToStorage];

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools, // ✅ Automatic execution, full type safety
  });

  return (
    <div>
      {messages.map((message) =>
        message.parts.map((part) => {
          if (part.type === "tool-call" && part.name === "updateUI") {
            // ✅ part.input and part.output are fully typed!
            return <div key={part.id}>Tool executed: {part.name}</div>;
          }
          return null;
        })
      )}
    </div>
  );
}
```

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import { 
  createChatClientOptions, 
  fetchServerSentEvents,
  type InferChatMessages 
} from "@tanstack/ai-client";
import { tool1, tool2 } from "./tools";

// Create typed tools array (no 'as const' needed!)
const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

Re-exported from `@tanstack/ai-client`:

- `UIMessage<TTools>` - Message type with tool type parameter
- `MessagePart<TTools>` - Message part with tool type parameter
- `TextPart` - Text content part
- `ThinkingPart` - Thinking content part
- `ToolCallPart<TTools>` - Tool call part (discriminated union)
- `ToolResultPart` - Tool result part
- `ChatClientOptions<TTools, TContext>` - Chat client options with typed client runtime context
- `ConnectionAdapter` - Connection adapter interface
- `InferChatMessages<T>` - Extract message type from options

Re-exported from `@tanstack/ai`:

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Bring Your Own Key](../advanced/byok) - Store keys and pass `byok` into `useChat`
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
- [Client Tools](../tools/client-tools) - Learn about client-side tools
