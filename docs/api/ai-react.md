# @tanstack/ai-react API

React hooks for TanStack AI, providing convenient React bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-react
```

## `useChat(options?)`

Main hook for managing chat state in React.

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function ChatComponent() {
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    addToolApprovalResponse,
  } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    initialMessages: [],
    onToolCall: async ({ toolName, input }) => {
      // Handle client tool execution
      return { result: "..." };
    },
  });

  return (
    <div>
      {/* Chat UI */}
    </div>
  );
}
```

### Options

Extends `ChatClientOptions` but omits state change callbacks (handled by React):

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

## Connection Adapters

Re-exported from `@tanstack/ai-client` for convenience:

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-react";
```

## Example: Basic Chat

```typescript
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
            <strong>{message.role}:</strong>{" "}
            {message.parts
              .filter((p) => p.type === "text")
              .map((p) => p.content)
              .join("")}
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

```typescript
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

## Example: Client Tools

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function ChatWithClientTools() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onToolCall: async ({ toolName, input }) => {
      switch (toolName) {
        case "updateUI":
          // Update React state
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
- `ToolCallPart`
- `ToolResultPart`
- `ChatClientOptions`
- `ConnectionAdapter`

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Client Tools](../guides/client-tools) - Learn about client-side tools

