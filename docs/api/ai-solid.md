---
title: "@tanstack/ai-solid"
slug: /api/ai-solid
order: 4
description: "API reference for @tanstack/ai-solid: the useChat primitive, generation primitives, and SolidJS bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-solid"
  - solidjs
  - solid
  - useChat
  - solid primitives
  - api reference
---

SolidJS primitives for TanStack AI. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Solid Chat UI](../ui/solid).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

solid: @tanstack/ai-solid

<!-- ::end:tabs -->

## `useChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

```tsx
import { createSignal, For } from "solid-js";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";

export function Chat() {
  const [input, setInput] = createSignal("");
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <div>
      <For each={messages()}>
        {(message) => (
          <div>
            <strong>{message.role}:</strong>
            <For each={message.parts}>
              {(part) => (part.type === "text" ? <span>{part.content}</span> : null)}
            </For>
          </div>
        )}
      </For>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input().trim() && !isLoading()) {
            sendMessage(input());
            setInput("");
          }
        }}
      >
        <input
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button type="submit" disabled={isLoading()}>
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
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe on mount and unsubscribe on cleanup. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. |

The primitive also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

To change an option after the chat starts, read a signal in an option getter (for example `get forwardedProps() { ... }`):

- A new `forwardedProps`, `context`, or `tools` value updates the current chat.
- A new `threadId` starts a new chat.

### Returns

State values are Solid `Accessor` functions. Call them to read the value, for example `messages()`.

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
| `partial`, `final` | Structured output. Only when you pass `outputSchema`. |

### Example: tool approval

A tool with `needsApproval: true` pauses the run. The pending call shows up in `interrupts`.

```tsx
import { For } from "solid-js";
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-solid";
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
    <For each={interrupts()}>
      {(interrupt) =>
        interrupt.kind === "tool-approval" ? (
          <div>
            <p>Approve: {interrupt.toolName}</p>
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
            <button onClick={() => interrupt.resolveInterrupt(false)}>
              Deny
            </button>
          </div>
        ) : null
      }
    </For>
  );
}
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

Binds chat options once at module scope and returns a `useChat` primitive that uses them.

```tsx
import { createChatHook, fetchServerSentEvents } from "@tanstack/ai-solid";

const { useChat: useSupportChat } = createChatHook({
  connection: fetchServerSentEvents("/api/chat"),
});

export function SupportScreen() {
  const chat = useSupportChat({ threadId: "support-1" });
  return <p>{chat.messages().length} messages</p>;
}
```

The bound primitive takes these per-call overrides: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools`, `interrupts`, and `outputSchema` on the factory options.

`@tanstack/ai-solid/ui` has its own `createChatHook` that also returns typed UI components. See [Solid Chat UI](../ui/solid).

## Generation hooks

Each primitive runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Primitive | `generate()` input | `result` |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Your own input type | Your own result type |

```tsx
import { useGenerateImage, fetchServerSentEvents } from "@tanstack/ai-solid";

export function ImageButton() {
  const image = useGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
    threadId: "image-studio",
  });

  return (
    <button
      disabled={image.isLoading()}
      onClick={() => image.generate({ prompt: "A mountain at sunset" })}
    >
      Generate
    </button>
  );
}
```

Options: `threadId` (required), `connection` or `fetcher`, `body`, `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, `reset()`, `runId`. The state fields are `Accessor` functions.

`useGenerateVideo` also returns `jobId` and `videoStatus`, and takes `onJobCreated` and `onStatusUpdate`.

## Realtime chat

This package does not export a realtime primitive. Use `RealtimeClient`, which this package re-exports. See [Realtime Chat](../media/realtime-chat).

## `useAudioRecorder(options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording()`, `isRecording()`, `isSupported`, `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## `useByok(client)`

Subscribes to a BYOK keyring and returns an `Accessor` for its snapshot. See [Bring Your Own Key](../advanced/byok).

```tsx
import { useByok } from "@tanstack/ai-solid";
import { byok } from "./byok";

export function KeyStatus() {
  const snapshot = useByok(byok);
  const last4 = () => {
    const openai = snapshot().status.openai;
    return openai && "masked" in openai ? openai.masked : "No key";
  };
  return <p>{last4()}</p>;
}
```

The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## MCP App bridge

This package does not export a bridge primitive. Use `createMcpAppBridge`, which this package re-exports. See [MCP Apps](../mcp/apps).

## `useRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API for the current Solid owner. Solid removes them when the owner is cleaned up. See [WebMCP Tools](../tools/webmcp).

```tsx
import { useRegisterWebMCPTools } from "@tanstack/ai-solid";
import { searchProducts } from "./tools";

const tools = [searchProducts];

export function ProductsPage() {
  useRegisterWebMCPTools(tools, {
    onError: (error) => console.error(error),
  });
  return null;
}
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context.

## `usePageWebMCPTools(options?)`

Reads the WebMCP tools that the page registered, as client tools. The accessor starts empty and updates when the page adds or removes a tool. Read it in a `get tools()` getter on `useChat`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```ts
import { usePageWebMCPTools } from "@tanstack/ai-solid";

export function useSameOriginPageTools() {
  return usePageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-solid` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Persistence | `localStoragePersistence`, `sessionStoragePersistence`, `indexedDBPersistence` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError`, `StorageUnavailableError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-solid/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `UseChatOptions`, `UseChatReturn` | The options and return value of `useChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Use<Primitive>Options`, `Use<Primitive>Return` | Options and return types for the generation and recorder primitives. The WebMCP primitives export only an options type. |

Pass a plain tools array to `useChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
