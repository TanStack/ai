---
title: "@tanstack/ai-octane"
id: ai-octane
order: 8
description: "API reference for @tanstack/ai-octane: the useChat hook, generation hooks, and Octane bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-octane"
  - octane
  - useChat
  - octane hooks
  - api reference
---

Octane hooks for TanStack AI. They work like the React hooks. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Octane Chat UI](../ui/octane).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

octane: @tanstack/ai-octane octane

<!-- ::end:tabs -->

`octane` is a required peer. The package publishes uncompiled `.tsrx` source, and your Octane plugin compiles it.

## `useChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

```tsx
import { useState } from "octane";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-octane";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.content)
            .join("")}
        </div>
      ))}
      <input
        value={input}
        onInput={(event) => setInput(event.currentTarget.value)}
      />
      <button
        disabled={isLoading}
        onClick={() => {
          void sendMessage(input);
          setInput("");
        }}
        type="button"
      >
        Send
      </button>
    </div>
  );
}
```

### Options

You must pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/api/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. See [Client Tools](../tools/client-tools). |
| `threadId` | The id of this chat. Required when `persistence` is on. If you omit it, the hook makes one after mount. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe on mount and unsubscribe on unmount. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. The hook always tags `framework: 'octane'`. |

The hook also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

When `connection`, `fetcher`, `forwardedProps`, `tools`, `context`, or `queue` change, the hook updates the current chat. A new `threadId` creates a new chat.

### Returns

State values are plain Octane values. The hook renders again when they change.

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
import { toolDefinition } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-octane";
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
    tools: [deleteFileTool],
  });

  return (
    <div>
      {interrupts.map((interrupt) =>
        interrupt.kind === "tool-approval" ? (
          <div key={interrupt.id}>
            <p>Approve: {interrupt.toolName}</p>
            <button onClick={() => interrupt.resolveInterrupt(true)} type="button">
              Approve
            </button>
            <button onClick={() => interrupt.resolveInterrupt(false)} type="button">
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
import { createChatHook, fetchServerSentEvents } from "@tanstack/ai-octane";

const { useChat: useSupportChat } = createChatHook({
  connection: fetchServerSentEvents("/api/chat"),
});

export function SupportScreen() {
  const chat = useSupportChat({ threadId: "support-1" });
  return <p>{chat.messages.length} messages</p>;
}
```

The bound hook takes these per-call overrides: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools`, `interrupts`, and `outputSchema` on the factory options.

`@tanstack/ai-octane/ui` has its own `createChatHook` that also returns typed UI components. See [Octane Chat UI](../ui/octane).

## Generation hooks

Each hook runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Hook | `generate()` input | `result` |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Your own input type | Your own result type |

```tsx
import { useGenerateImage, fetchServerSentEvents } from "@tanstack/ai-octane";

export function ImageButton() {
  const image = useGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
  });

  return (
    <button
      disabled={image.isLoading}
      onClick={() => void image.generate({ prompt: "A mountain at sunset" })}
      type="button"
    >
      Generate
    </button>
  );
}
```

Options: `connection` or `fetcher`, `id`, `body`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, and `reset()`.

`useGenerateVideo` also returns `jobId` and `videoStatus`, and takes `onJobCreated` and `onStatusUpdate`.

## `useRealtimeChat(options)`

Runs a voice conversation with a realtime model. Pass `getToken` and `adapter`. See [Realtime Chat](../media/realtime-chat).

```tsx
import { useRealtimeChat } from "@tanstack/ai-octane";
import { openaiRealtime } from "@tanstack/ai-openai";

export function VoiceChat() {
  const chat = useRealtimeChat({
    getToken: () => fetch("/api/realtime-token").then((r) => r.json()),
    adapter: openaiRealtime(),
  });

  return chat.status === "idle" ? (
    <button onClick={() => void chat.connect()} type="button">Start</button>
  ) : (
    <button onClick={() => void chat.disconnect()} type="button">Stop</button>
  );
}
```

Returns `status`, `error`, `mode`, `messages`, `connect()`, `disconnect()`, `startListening()`, `stopListening()`, `interrupt()`, `sendText(text)`, `sendImage(data, mimeType)`, `updateSession(config)`, plus audio levels and frequency data for visualizers.

## `useAudioRecorder(options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording`, `isRecording`, `isSupported`, `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## BYOK

This package does not export a BYOK hook. Read the keyring with `byok.getSnapshot()` and `byok.subscribe(listener)`. BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-octane/byok` subpath. See [Bring Your Own Key](../advanced/byok).

## `useMcpAppBridge(options)`

Returns a stable MCP App bridge for one thread. It always calls the latest `chat.sendMessage` and `onLink`. Options: `threadId`, `callEndpoint`, `chat`, `fetchImpl`, `onLink`. See [MCP Apps](../mcp/apps).

This package has no `mcp-apps` subpath, so it does not ship the `MCPAppResource` component.

## `useRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API while the component is mounted. See [WebMCP Tools](../tools/webmcp).

```tsx
import { useRegisterWebMCPTools } from "@tanstack/ai-octane";
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
import { usePageWebMCPTools } from "@tanstack/ai-octane";

export function useSameOriginPageTools() {
  return usePageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-octane` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

The browser persistence adapters (`localStoragePersistence` and the others) are not re-exported here. Import them from `@tanstack/ai-client`.

## Types

| Type | What it is |
| --- | --- |
| `UseChatOptions`, `UseChatReturn` | The options and return value of `useChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Use<Hook>Options`, `Use<Hook>Return` | Options and return types for the generation, realtime, and recorder hooks. The WebMCP hooks export only an options type. |

Pass a plain tools array to `useChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
