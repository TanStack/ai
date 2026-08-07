---
title: "@tanstack/ai-preact"
slug: /api/ai-preact
order: 5
description: "Preact useChat hook, connection adapters, and typed client tools."
keywords:
  - tanstack ai
  - "@tanstack/ai-preact"
  - preact
  - useChat
  - preact hooks
  - api reference
---

If you need streaming chat in Preact → `useChat` + a connection adapter.

```bash
npm install @tanstack/ai-preact
```

## `useChat(options?)`

1. Wire a connection.
2. Pass `.client()` tools if needed (auto-executed).
3. Render `messages` / call `sendMessage`.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { useState } from "preact/hooks";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Show a notification in the UI",
  inputSchema: z.object({ message: z.string() }),
});

function ChatComponent() {
  const [, setNotification] = useState<string | null>(null);

  const updateUI = updateUIDef.client((input) => {
    setNotification(input.message);
    return { success: true };
  });

  const tools = [updateUI];

  const chatOptions = createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
  });

  type ChatMessages = InferChatMessages<typeof chatOptions>;

  const { messages, sendMessage, isLoading, error, addToolApprovalResponse } =
    useChat(chatOptions);

  return <div>{/* Chat UI with typed messages */}</div>;
}
```

### Options

Extends `ChatClientOptions` from `@tanstack/ai-client`:

- `connection` — required adapter
- `tools?` — `.client()` implementations (auto-run; no `onToolCall`)
- `initialMessages?` / `id?` / `threadId?` — seed + AG-UI thread
- `forwardedProps?` — client JSON → server
- `context?` — client-local tool context (not serialized)

Also: `onResponse?`, `onChunk?`, `onFinish?`, `onError?`, `streamProcessor?`.  
`body?` is **deprecated** — use `forwardedProps`.

### Returns

```typescript
import type { UIMessage } from "@tanstack/ai-preact";
import type { ModelMessage } from "@tanstack/ai/client";

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

---

## Connection adapters

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-preact";
```

---

## Basic chat

```tsx
import { useState } from "preact/hooks";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  const handleSubmit = (e: Event) => {
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
                  <div key={idx} class="text-sm text-gray-500 italic">
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
          onInput={(e) => setInput(e.currentTarget.value)}
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

## Tool approval

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";

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

## Client tools (typed)

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { useState } from "preact/hooks";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Show a notification in the UI",
  inputSchema: z.object({ message: z.string(), type: z.string() }),
});

const saveToStorageDef = toolDefinition({
  name: "saveToStorage",
  description: "Save a value to localStorage",
  inputSchema: z.object({ key: z.string(), value: z.string() }),
});

export function ChatWithClientTools() {
  const [notification, setNotification] = useState<{
    message: string;
    type: string;
  } | null>(null);

  const updateUI = updateUIDef.client((input) => {
    setNotification({ message: input.message, type: input.type });
    return { success: true };
  });

  const saveToStorage = saveToStorageDef.client((input) => {
    localStorage.setItem(input.key, input.value);
    return { saved: true };
  });

  const tools = [updateUI, saveToStorage];

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
  });

  return (
    <div>
      {messages.map((message) =>
        message.parts.map((part) => {
          if (part.type === "tool-call" && part.name === "updateUI") {
            return <div>Tool executed: {part.name}</div>;
          }
          return null;
        })
      )}
    </div>
  );
}
```

## `createChatClientOptions(options)`

```typescript
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-preact";
import { tool1, tool2 } from "./tools";

const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

From `@tanstack/ai-client`: `UIMessage`, `MessagePart`, `TextPart`, `ThinkingPart`, `ToolCallPart`, `ToolResultPart`, `ChatClientOptions`, `ConnectionAdapter`, `InferChatMessages`.

From `@tanstack/ai`: `toolDefinition()`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`.

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Client Tools](../tools/client-tools)
