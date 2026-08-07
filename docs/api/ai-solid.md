---
title: "@tanstack/ai-solid"
slug: /api/ai-solid
order: 4
description: "SolidJS useChat primitive, connection adapters, and typed client tools."
keywords:
  - tanstack ai
  - "@tanstack/ai-solid"
  - solidjs
  - solid
  - useChat
  - solid primitives
  - api reference
---

If you need streaming chat in SolidJS → `useChat` + a connection adapter.

```bash
npm install @tanstack/ai-solid
```

## `useChat(options?)`

1. Wire a connection.
2. Pass `.client()` tools if needed (auto-executed).
3. Read accessors with `()` — `messages()`, `isLoading()`, `error()`.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import {
  createChatClientOptions,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { createSignal } from "solid-js";

const updateUIDef = toolDefinition({
  name: "updateUI",
  description: "Show a notification in the UI",
  inputSchema: z.object({ message: z.string() }),
});

function ChatComponent() {
  const [, setNotification] = createSignal<string | null>(null);

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
import type { Accessor } from "solid-js";
import type { UIMessage } from "@tanstack/ai-solid";
import type { ModelMessage } from "@tanstack/ai/client";

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

---

## Connection adapters

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  stream,
  type ConnectionAdapter,
} from "@tanstack/ai-solid";
```

---

## Basic chat

```tsx
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

## Tool approval

```tsx
import { For } from "solid-js";
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
            {(part) => {
              if (
                part.type === "tool-call" &&
                part.state === "approval-requested" &&
                part.approval
              ) {
                return (
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
                );
              }
              return null;
            }}
          </For>
        )}
      </For>
    </div>
  );
}
```

## Client tools (typed)

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { createSignal, For } from "solid-js";

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
  const [notification, setNotification] = createSignal<{
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
      <For each={messages()}>
        {(message) => (
          <For each={message.parts}>
            {(part) => {
              if (part.type === "tool-call" && part.name === "updateUI") {
                return <div>Tool executed: {part.name}</div>;
              }
              return null;
            }}
          </For>
        )}
      </For>
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
import { fetchServerSentEvents } from "@tanstack/ai-solid";
import { tool1, tool2 } from "./tools";

const tools = [tool1, tool2];

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

type Messages = InferChatMessages<typeof chatOptions>;
```

## Types

From `@tanstack/ai-client`: `UIMessage`, `MessagePart`, `TextPart`, `ThinkingPart`, `ToolCallPart`, `ToolResultPart`, `ChatClientOptions`, `ConnectionAdapter`, `InferChatMessages`, `ChatRequestBody`.

From `@tanstack/ai`: `toolDefinition()`, `ToolDefinitionInstance`, `ClientTool`, `ServerTool`.

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Tools Guide](../tools/tools)
- [Client Tools](../tools/client-tools)
