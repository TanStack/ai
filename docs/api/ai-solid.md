# @tanstack/ai-solid API

SolidJS primitives for TanStack AI, providing convenient SolidJS bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-solid
```

## `useChat(options?)`

Main primitive for managing chat state in SolidJS with full type safety.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";

function ChatComponent() {
  // Create client tool implementations
  const updateUI = updateUIDef.client((input) => {
    setNotification(input.message);
    return { success: true };
  });

  // Create typed tools array (no 'as const' needed!)
  const tools = clientTools(updateUI);

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
- `id?` - Unique identifier for this chat instance
- `body?` - Additional body parameters to send
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
interface UseChatReturn {
  messages: Accessor<UIMessage[]>;
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
  isLoading: Accessor<boolean>;
  error: Accessor<Error | undefined>;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
}
```

**Note:** Unlike React, `messages`, `isLoading`, and `error` are SolidJS `Accessor` functions, so you need to call them to get their values (e.g., `messages()` instead of just `messages`).

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-solid";
```

## Example: Basic Chat

```typescript
import { createSignal, For } from "solid-js";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

export function Chat() {
  const [input, setInput] = createSignal("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input().trim() && !isLoading()) {
      sendMessage(input());
      setInput("");
    }
  };

  return (
    <div>
      <div>
        <For each={messages()}>
          {(message) => (
            <div>
              <strong>{message.role}:</strong>
              <For each={message.parts}>
                {(part) => {
                  if (part.type === "thinking") {
                    return (
                      <div class="text-sm text-gray-500 italic">
                        💭 Thinking: {part.content}
                      </div>
                    );
                  }
                  if (part.type === "text") {
                    return <span>{part.content}</span>;
                  }
                  return null;
                }}
              </For>
            </div>
          )}
        </For>
      </div>
      <form onSubmit={handleSubmit}>
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          disabled={isLoading()}
        />
        <button type="submit" disabled={isLoading()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

## Example: Tool Approval

```typescript
import { For, Show } from "solid-js";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

export function ChatWithApproval() {
  const { messages, sendMessage, addToolApprovalResponse } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      <For each={messages()}>
        {(message) => (
          <For each={message.parts}>
            {(part) => (
              <Show
                when={
                  part.type === "tool-call" &&
                  part.state === "approval-requested" &&
                  part.approval
                }
              >
                <div>
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
              </Show>
            )}
          </For>
        )}
      </For>
    </div>
  );
}
```

## Example: Client Tools with Type Safety

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { updateUIDef, saveToStorageDef } from "./tool-definitions";
import { createSignal, For } from "solid-js";

export function ChatWithClientTools() {
  const [notification, setNotification] = createSignal(null);

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
  const tools = clientTools(updateUI, saveToStorage);

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools, // ✅ Automatic execution, full type safety
  });

  return (
    <div>
      <For each={messages()}>
        {(message) => (
          <For each={message.parts}>
            {(part) => {
              if (part.type === "tool-call" && part.name === "updateUI") {
                // ✅ part.input and part.output are fully typed!
                return <div>Tool executed: {part.name}</div>;
              }
            }}
          </For>
        )}
      </For>
    </div>
  );
}
```

## `createChatClientOptions(options)`

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import { 
  clientTools, 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";

// Create typed tools array (no 'as const' needed!)
const tools = clientTools(tool1, tool2);

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
- `ChatClientOptions<TTools>` - Chat client options
- `ConnectionAdapter` - Connection adapter interface
- `InferChatMessages<T>` - Extract message type from options
- `ChatRequestBody` - Request body type

Re-exported from `@tanstack/ai`:

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about the isomorphic tool system
- [Client Tools](../guides/client-tools) - Learn about client-side tools
