# @tanstack/ai-solid API

SolidJS primitives for TanStack AI, providing convenient SolidJS bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-solid
```

## `useChat(options?)`

Main primitive for managing chat state in SolidJS.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

function ChatComponent() {
  const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
    useChat({
      connection: fetchServerSentEvents("/api/chat"),
      initialMessages: [],
      onToolCall: async ({ toolName, input }) => {
        // Handle client tool execution
        return { result: "..." };
      },
    });

  return <div>{/* Chat UI */}</div>;
}
```

### Options

Extends `ChatClientOptions` but omits state change callbacks (handled by SolidJS signals):

- `connection` - Connection adapter (required)
- `initialMessages?` - Initial messages array
- `id?` - Unique identifier for this chat instance
- `body?` - Additional body parameters to send
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `onToolCall?` - Callback for client-side tool execution
- `streamProcessor?` - Stream processing configuration

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

## Example: Client Tools

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { createSignal } from "solid-js";

export function ChatWithClientTools() {
  const [notification, setNotification] = createSignal("");

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onToolCall: async ({ toolName, input }) => {
      switch (toolName) {
        case "updateUI":
          // Update SolidJS state
          setNotification(input.message);
          return { success: true };

        case "saveToLocalStorage":
          localStorage.setItem(input.key, input.value);
          return { saved: true };

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    },
  });

  // ... rest of component
}
```

## Types

All types are re-exported from `@tanstack/ai-client`:

- `UIMessage`
- `MessagePart`
- `TextPart`
- `ThinkingPart`
- `ToolCallPart`
- `ToolResultPart`
- `ChatClientOptions`
- `ConnectionAdapter`
- `ChatRequestBody`

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Client Tools](../guides/client-tools) - Learn about client-side tools
