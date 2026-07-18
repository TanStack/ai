---
title: "@tanstack/ai-solid"
slug: /api/ai-solid
order: 4
description: "API reference for @tanstack/ai-solid — SolidJS primitives including useChat for streaming chat with full type safety."
keywords:
  - tanstack ai
  - "@tanstack/ai-solid"
  - solidjs
  - solid
  - useChat
  - solid primitives
  - api reference
---

SolidJS primitives for TanStack AI, providing convenient SolidJS bindings for the headless client.

## Installation

```bash
npm install @tanstack/ai-solid
```

## `useChat(options?)`

Main primitive for managing chat state in SolidJS with full type safety.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { 
  createChatClientOptions, 
  type InferChatMessages 
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
- `id?` - Unique identifier for this chat instance
- `threadId?` - Thread ID for AG-UI run correlation. Persists across sends; auto-generated if omitted
- `forwardedProps?` - Arbitrary client-controlled JSON forwarded to the server in the AG-UI `RunAgentInput.forwardedProps` field (e.g., `{ provider: 'openai', model: 'gpt-5.5' }`)
- `body?` - **Deprecated.** Use `forwardedProps` instead. Still works for backward compatibility; values are merged into `forwardedProps` on the wire
- `context?` - Typed client-local runtime context passed to client tool implementations. This value is not serialized to the server
- `onResponse?` - Callback when response is received
- `onChunk?` - Callback when stream chunk is received
- `onFinish?` - Callback when response finishes
- `onError?` - Callback when error occurs
- `streamProcessor?` - Stream processing configuration

**Note:** Client tools are now automatically executed - no `onToolCall` callback needed!

### Returns

```typescript
import type { Accessor } from "solid-js";
import type { UIMessage } from "@tanstack/ai-solid";
import type { ModelMessage } from "@tanstack/ai/client";
import type {
  ChatResumeState,
  ChatPendingInterrupt,
  RunAgentResumeItem,
} from "@tanstack/ai-client";

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
  // Correlation ids `{ threadId, runId }` for the interrupted run, or null.
  resumeState: Accessor<ChatResumeState | null>;
  // Interrupts currently awaiting a resume response.
  pendingInterrupts: Accessor<ChatPendingInterrupt[]>;
  // Resolve pending interrupts by sending AG-UI resume entries.
  resumeInterrupts: (
    resume: RunAgentResumeItem[],
    state?: ChatResumeState,
  ) => Promise<boolean>;
}
```

**Note:** Unlike React, `messages`, `isLoading`, and `error` are SolidJS `Accessor` functions, so you need to call them to get their values (e.g., `messages()` instead of just `messages`).

## Generation Hooks

Solid also exports `useGeneration`, `useGenerateImage`, `useGenerateAudio`,
`useGenerateSpeech`, `useTranscription`, `useSummarize`, and
`useGenerateVideo`.

Generation hook options include `connection` or `fetcher`, `id`, `body`,
`persistence`, `initialResumeSnapshot`, `devtools`, `onResult`, `onError`,
`onProgress`, and `onChunk`.

Generation hook returns include `generate`, `result`, `isLoading`, `error`,
`status`, `stop`, `reset`, `resumeSnapshot`, `resumeState`,
`pendingArtifacts`, and `resultArtifacts`. Reactive values are Solid accessors,
so read `resumeState()` and `pendingArtifacts()`. Video generation also returns
`jobId` and `videoStatus`.

For the end-to-end persistence setup, see
[Generation Persistence](../persistence/generation-persistence).

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

## Example: Tool Approval

```tsx
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

## Example: Client Tools with Type Safety

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
import { 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
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
  const [notification, setNotification] = createSignal<{ message: string; type: string } | null>(null);

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
      <For each={messages()}>
        {(message) => (
          <For each={message.parts}>
            {(part) => {
              if (part.type === "tool-call" && part.name === "updateUI") {
                // ✅ part.input and part.output are fully typed!
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

Helper to create typed chat options (re-exported from `@tanstack/ai-client`).

```typescript
import { 
  createChatClientOptions, 
  type InferChatMessages 
} from "@tanstack/ai-client";
import { fetchServerSentEvents } from "@tanstack/ai-solid";
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
- `ChatRequestBody` - Request body type

Re-exported from `@tanstack/ai`:

- `toolDefinition()` - Create isomorphic tool definition
- `ToolDefinitionInstance` - Tool definition type
- `ClientTool` - Client tool type
- `ServerTool` - Server tool type

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about the isomorphic tool system
- [Client Tools](../tools/client-tools) - Learn about client-side tools
