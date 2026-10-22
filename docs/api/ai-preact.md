---
title: "@tanstack/ai-preact"
slug: /api/ai-preact
order: 5
description: "API reference for @tanstack/ai-preact: the useChat hook and Preact bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-preact"
  - preact
  - useChat
  - preact hooks
  - api reference
---

Preact hooks for TanStack AI. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Preact Chat UI](../ui/preact).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

preact: @tanstack/ai-preact

<!-- ::end:tabs -->

## `useChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

```tsx
import { useState } from "preact/hooks";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts.map((part, idx) =>
            part.type === "text" ? <span key={idx}>{part.content}</span> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !isLoading) {
            sendMessage(input);
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### Options

You must pass `threadId`. You must also pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/api/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. See [Client Tools](../tools/client-tools). |
| `threadId` | Required. The id of this chat. Use a stable id for each conversation, for example the id from your route. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. In Preact it only labels the chat in devtools. Read structured output from the `structured-output` part in `messages`. |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe on mount and unsubscribe on unmount. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. |

The hook also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

When `forwardedProps`, `tools`, `context`, or `queue` change, the hook updates the current chat.

### Returns

State values are plain Preact values. The hook renders again when they change.

| Field | What it is |
| --- | --- |
| `messages` | The `UIMessage` array of the chat. |
| `sendMessage(content, options?)` | Sends a user message. `content` is a string or `{ content, id?, metadata? }`. `options` takes `whenBusy` and `body`. |
| `isLoading` | `true` while a response streams. |
| `error` | The last error, or `undefined`. |
| `status` | `"ready"`, `"submitted"`, `"streaming"`, or `"error"`. |
| `stop()` | Stops the current response. |
| `reload()` | Runs the last user message again. |
| `append(message)` | Adds a `UIMessage` or `ModelMessage` and starts a run. |
| `addToolResult(result)` | Gives the result of a client tool by hand: `{ toolCallId, tool, output, state?, errorText? }`. |
| `setMessages(messages)`, `clear()` | Replace or clear the messages. |
| `queue`, `cancelQueued(id)` | Messages that wait while a run is busy. See [Queueing](../chat/queueing). |
| `runId` | The id of the run in flight, or `null`. |
| `interrupts` | Pending interrupts. Each item has `resolveInterrupt(...)`. See [Interrupts](../interrupts/overview). |
| `resolveInterrupts`, `cancelInterrupts`, `retryInterrupts`, `resumeInterruptsUnsafe` | Act on all pending interrupts at once. |
| `interruptErrors`, `resuming` | Errors from the last resume, and `true` while a resume runs. |
| `isHydrating` | `true` while the chat loads from persistence. |
| `hasOlderMessages`, `loadOlderMessages()` | Page in older messages. See [Chat Persistence](../persistence/chat-persistence). |
| `isSubscribed`, `connectionStatus`, `sessionGenerating` | State of the live subscription. |

### Example: tool approval

A tool with `needsApproval: true` pauses the run. The pending call shows up in `interrupts`.

```tsx
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-preact";
import { z } from "zod";

const deleteFileTool = toolDefinition({
  name: "delete_file",
  description: "Delete a file",
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
});

export function ChatWithApproval() {
  const { interrupts } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    tools: [deleteFileTool],
  });

  return (
    <div>
      {interrupts.map((interrupt) =>
        interrupt.kind === "tool-approval" ? (
          <div key={interrupt.id}>
            <p>Approve: {interrupt.toolName}</p>
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
            <button onClick={() => interrupt.resolveInterrupt(false)}>
              Deny
            </button>
          </div>
        ) : null,
      )}
    </div>
  );
}
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

Binds chat options once at module scope and returns a `useChat` hook that uses them.

```tsx
import { createChatHook, fetchServerSentEvents } from "@tanstack/ai-preact";

const { useChat: useSupportChat } = createChatHook({
  connection: fetchServerSentEvents("/api/chat"),
});

export function SupportScreen() {
  const chat = useSupportChat({ threadId: "support-1" });
  return <p>{chat.messages.length} messages</p>;
}
```

The bound hook takes these per-call overrides: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools` and `interrupts` on the factory options.

`@tanstack/ai-preact/ui` has its own `createChatHook` that also returns typed UI components. See [Preact Chat UI](../ui/preact).

## Generation hooks

This package does not export generation hooks. Use `GenerationClient` or `VideoGenerationClient`, which this package re-exports. See [`GenerationClient`](./ai-client#generationclient).

## Realtime chat

This package does not export a realtime hook. Use `RealtimeClient`, which this package re-exports. See [Realtime Chat](../media/realtime-chat).

## Audio recorder

This package does not export a recorder hook. Use `AudioRecorder`, which this package re-exports. See [Audio Recording](../media/audio-recording).

## `useByok(client)`

Subscribes to a BYOK keyring and returns its snapshot. See [Bring Your Own Key](../advanced/byok).

```tsx
import { useByok } from "@tanstack/ai-preact";
import { byok } from "./byok";

export function KeyStatus() {
  const snapshot = useByok(byok);
  const openai = snapshot.status.openai;
  return <p>{openai && "masked" in openai ? openai.masked : "No key"}</p>;
}
```

The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## `useMcpAppBridge(options)`

Returns a stable MCP App bridge for one thread. It always calls the latest `chat.sendMessage` and `onLink`. Options: `threadId`, `callEndpoint`, `chat`, `fetchImpl`, `onLink`. See [MCP Apps](../mcp/apps).

The `MCPAppResource` component, which renders a `ui-resource` part, is on the `@tanstack/ai-preact/mcp-apps` subpath.

## `useRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API while the component is mounted. See [WebMCP Tools](../tools/webmcp).

```tsx
import { useRegisterWebMCPTools } from "@tanstack/ai-preact";
import { searchProducts } from "./tools";

const tools = [searchProducts];

export function ProductsPage() {
  useRegisterWebMCPTools(tools, {
    onError: (error) => console.error(error),
  });
  return null;
}
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context. The hook registers the tools again when `tools` or `options` change, so keep them stable.

## `usePageWebMCPTools(options?)`

Reads the WebMCP tools that the page registered, as client tools. The array starts empty and updates when the page adds or removes a tool. Pass it to `useChat` as `tools`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```tsx
import { usePageWebMCPTools } from "@tanstack/ai-preact";

export function useSameOriginPageTools() {
  return usePageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-preact` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Persistence | `localStoragePersistence`, `sessionStoragePersistence`, `indexedDBPersistence` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError`, `StorageUnavailableError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-preact/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `UseChatOptions`, `UseChatReturn` | The options and return value of `useChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `UseRegisterWebMCPToolsOptions`, `UsePageWebMCPToolsOptions`, `UseMcpAppBridgeOptions` | Options for the WebMCP and bridge hooks. |

Pass a plain tools array to `useChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
