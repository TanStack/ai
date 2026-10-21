---
title: "@tanstack/ai-remix"
id: ai-remix
order: 9
description: "API reference for @tanstack/ai-remix: the createChat helper, generation helpers, and Remix 3 bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-remix"
  - remix
  - createChat
  - createChatHook
  - api reference
---

Remix 3 helpers for TanStack AI. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Remix Chat UI](../ui/remix).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

remix: @tanstack/ai-remix remix

<!-- ::end:tabs -->

`remix` is a required peer. The package publishes uncompiled source. Remix compiles the JSX through the `remix/ui` `jsxImportSource`.

Every helper takes the component `Handle` as its first argument. Call it in the setup function, not in the render function.

The server side is a normal route. A Remix controller action returns the same SSE `Response` as any other host:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { createController } from "remix/router";
import { post, route } from "remix/routes";

const routes = route({
  chat: {
    stream: post("/chat"),
  },
});

export default createController(routes.chat, {
  actions: {
    async stream({ request }) {
      const { messages, threadId, runId } = await chatParamsFromRequest(request);

      const stream = chat({
        adapter: openaiText("gpt-6.1-sol"),
        messages,
        threadId,
        runId,
      });

      return toServerSentEventsResponse(stream);
    },
  },
});
```

## `createChat(handle, options)`

Holds the messages and the run state of one chat, and talks to your server route.

```tsx
import { createChat, fetchServerSentEvents } from "@tanstack/ai-remix";
import { clientEntry, on, type Handle } from "remix/ui";

export const Chat = clientEntry(
  import.meta.url,
  function Chat(handle: Handle) {
    const chat = createChat(handle, {
      connection: fetchServerSentEvents("/chat"),
    });

    return () => (
      <div>
        {chat.messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}:</strong>
            {message.parts
              .filter((part) => part.type === "text")
              .map((part) => part.content)
              .join("")}
          </div>
        ))}
        <form
          mix={on("submit", (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const text = String(new FormData(form).get("message") ?? "").trim();
            if (text === "") {
              return;
            }
            form.reset();
            void chat.sendMessage(text);
          })}
        >
          <input name="message" disabled={chat.isLoading} />
          <button type="submit" disabled={chat.isLoading}>
            Send
          </button>
        </form>
      </div>
    );
  },
);
```

Put `connection` and `tools` in setup. They are not serializable `clientEntry` props.

### Options

You must pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. A `get tools()` getter is read each time a run starts. See [Client Tools](../tools/client-tools). |
| `threadId` | The id of this chat. Required when `persistence` is on. Default: `handle.id`. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe in setup and unsubscribe when the handle aborts. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. The helper always tags `framework: 'remix'`. |

The helper also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

### Returns

State fields are getters. Read them in the render function, so each paint sees the latest values. Cleanup runs when `handle.signal` aborts.

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
import { createChat, fetchServerSentEvents } from "@tanstack/ai-remix";
import { clientEntry, on, type Handle } from "remix/ui";
import { z } from "zod";

const deleteFileTool = toolDefinition({
  name: "delete_file",
  description: "Delete a file",
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
});

export const ChatWithApproval = clientEntry(
  import.meta.url,
  function ChatWithApproval(handle: Handle) {
    const chat = createChat(handle, {
      connection: fetchServerSentEvents("/chat"),
      tools: [deleteFileTool],
    });

    return () => (
      <div>
        {chat.interrupts.map((interrupt) =>
          interrupt.kind === "tool-approval" ? (
            <div key={interrupt.id}>
              <p>Approve: {interrupt.toolName}</p>
              <button
                type="button"
                mix={on("click", () => interrupt.resolveInterrupt(true))}
              >
                Approve
              </button>
              <button
                type="button"
                mix={on("click", () => interrupt.resolveInterrupt(false))}
              >
                Deny
              </button>
            </div>
          ) : null,
        )}
      </div>
    );
  },
);
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

This package does not export `createChatHook` from its main entry. `@tanstack/ai-remix/ui` has a `createChatHook` that binds chat options and typed UI components. Call it once at module scope. Then your app calls the returned factory with the handle and renders `<ui.Chat chat={chat} />`. See [Remix Chat UI](../ui/remix).

## Generation hooks

Each helper runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Helper | `generate()` input | `result` |
| --- | --- | --- |
| `createGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `createGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `createGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `createTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `createSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `createGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `createGeneration` | Your own input type | Your own result type |

```tsx
import { createGenerateImage, fetchServerSentEvents } from "@tanstack/ai-remix";
import { on, type Handle } from "remix/ui";

function ImageGenerator(handle: Handle) {
  const image = createGenerateImage(handle, {
    connection: fetchServerSentEvents("/api/generate/image"),
  });

  return () => (
    <button
      type="button"
      disabled={image.isLoading}
      mix={on("click", () => {
        void image.generate({ prompt: "A sunset over mountains" });
      })}
    >
      Generate
    </button>
  );
}
```

Options: `connection` or `fetcher`, `body`, `threadId`, `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, `reset()`, `runId`. The state fields are getters.

`createGenerateVideo` also returns `jobId` and `videoStatus`, and takes `onJobCreated` and `onStatusUpdate`.

## `createRealtimeChat(handle, options)`

Runs a voice conversation with a realtime model. Pass `getToken` and `adapter`. See [Realtime Chat](../media/realtime-chat).

```tsx
import { createRealtimeChat } from "@tanstack/ai-remix";
import { openaiRealtime } from "@tanstack/ai-openai";
import { on, type Handle } from "remix/ui";

function VoiceChat(handle: Handle) {
  const chat = createRealtimeChat(handle, {
    getToken: () => fetch("/api/realtime-token").then((response) => response.json()),
    adapter: openaiRealtime(),
  });

  return () => (
    <button
      type="button"
      mix={on("click", () => {
        if (chat.status === "idle") {
          void chat.connect();
          return;
        }
        void chat.disconnect();
      })}
    >
      {chat.status === "idle" ? "Start" : "Stop"}
    </button>
  );
}
```

Returns `status`, `error`, `mode`, `messages`, `connect()`, `disconnect()`, `startListening()`, `stopListening()`, `interrupt()`, `sendText(text)`, `sendImage(data, mimeType)`, `updateSession(config)`, plus audio levels and frequency data for visualizers.

## `createAudioRecorder(handle, options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording`, `isRecording`, `isSupported` (getters), `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## `createByok(handle, client)`

Subscribes to a BYOK keyring. The return value is a function that gives the latest snapshot. See [Bring Your Own Key](../advanced/byok).

```tsx
import { createByok } from "@tanstack/ai-remix";
import type { Handle } from "remix/ui";
import { byok } from "./byok";

function KeyStatus(handle: Handle) {
  const getSnapshot = createByok(handle, byok);

  return () => {
    const openai = getSnapshot().status.openai;
    return <p>{openai && "masked" in openai ? openai.masked : "No key"}</p>;
  };
}
```

The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## `createMcpAppBridge(handle, options)`

Creates an MCP App bridge for one thread. Options: `threadId`, `callEndpoint`, `chat`, `fetchImpl`, `onLink`. See [MCP Apps](../mcp/apps).

## `createRegisterWebMCPTools(handle, tools, options?)`

Exposes client tools to the browser WebMCP API. Remix removes them when `handle.signal` aborts. See [WebMCP Tools](../tools/webmcp).

```tsx
import { createRegisterWebMCPTools } from "@tanstack/ai-remix";
import { clientEntry, type Handle } from "remix/ui";
import { searchProducts } from "./tools";

export const ProductsPage = clientEntry(
  import.meta.url,
  function ProductsPage(handle: Handle) {
    createRegisterWebMCPTools(handle, [searchProducts], {
      onError: (error) => console.error(error),
    });
    return () => null;
  },
);
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context.

## `createPageWebMCPTools(handle, options?)`

Reads the WebMCP tools that the page registered, as client tools. The `tools` field starts empty. When the page adds or removes a tool, the helper updates `tools` and calls `handle.update()`. Read it in a `get tools()` getter on `createChat`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```ts
import { createPageWebMCPTools } from "@tanstack/ai-remix";
import type { Handle } from "remix/ui";

export function readPageTools(handle: Handle) {
  return createPageWebMCPTools(handle, {
    filter: (tool) => tool.origin === location.origin,
  });
}
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-remix` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

The browser persistence adapters (`localStoragePersistence` and the others) are not re-exported here. Import them from `@tanstack/ai-client`. BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-remix/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `CreateChatOptions`, `CreateChatReturn` | The options and return value of `createChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Create<Helper>Options`, `Create<Helper>Return` | Options for each helper. The generation and realtime helpers also export a return type. |

Pass a plain tools array to `createChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
