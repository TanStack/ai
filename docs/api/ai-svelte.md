---
title: "@tanstack/ai-svelte"
id: ai-svelte
order: 6
description: "API reference for @tanstack/ai-svelte: the createChat factory, generation factories, and Svelte 5 rune bindings for the headless TanStack AI client."
keywords:
  - tanstack ai
  - "@tanstack/ai-svelte"
  - svelte
  - svelte 5
  - createChat
  - runes
  - api reference
---

Svelte 5 factory functions for TanStack AI, built on runes. To build your first chat, start with the [Quick Start](../getting-started/quick-start). For a typed chat layout, see [Svelte Chat UI](../ui/svelte).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

svelte: @tanstack/ai-svelte

<!-- ::end:tabs -->

The factories are functions, not hooks, so their names start with `create`. Call them during component init.

## `createChat(options)`

Holds the messages and the run state of one chat, and talks to your server route.

```svelte
<script lang="ts">
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";

  let input = $state("");
  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input.trim() && !chat.isLoading) {
      chat.sendMessage(input);
      input = "";
    }
  };
</script>

{#each chat.messages as message (message.id)}
  <div>
    <strong>{message.role}:</strong>
    {#each message.parts as part}
      {#if part.type === "text"}<span>{part.content}</span>{/if}
    {/each}
  </div>
{/each}
<form onsubmit={handleSubmit}>
  <input bind:value={input} />
  <button type="submit" disabled={chat.isLoading}>Send</button>
</form>
```

### Options

You must pass `threadId`. You must also pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter, for example `fetchServerSentEvents("/api/chat")`. See [Transports](../transports/overview). |
| `fetcher` | A function that returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. They run when the model calls them. Read reactive state in a `get tools()` getter to change them later. See [Client Tools](../tools/client-tools). |
| `threadId` | Required. The id of this chat. Use a stable id for each conversation, for example the id from your route. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `forwardedProps` field, for example `{ model: "gpt-6.1-sol" }`. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `outputSchema` | A Standard Schema. Adds typed `partial` and `final` to the return value. See [Streaming structured output](../structured-outputs/streaming). |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `live` | Subscribe when the chat is created. |
| `queue` | What `sendMessage` does while a run is busy. Default: queue the message. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok`, `byokProvider` | A keyring from `defineByok()`. See [Bring Your Own Key](../advanced/byok). |
| `devtools` | Display options for TanStack AI Devtools. |

The factory also takes the `ChatClient` callbacks (`onResponse`, `onChunk`, `onFinish`, `onError`, `onInterruptStateChange`, `onCustomEvent`) and the other client options. See [`ChatClient` options](./ai-client#constructor-options).

To change `forwardedProps` or `context` after the chat starts, call `chat.updateForwardedProps(value)` or `chat.updateContext(value)`.

### Returns

State fields are reactive getters backed by `$state`. Read them on the object, for example `chat.messages`. Do not destructure them, or you keep only the first value.

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
| `updateForwardedProps(value)`, `updateContext(value)` | Change `forwardedProps` or `context` for the next sends. |
| `dispose()` | Ends the chat client and releases devtools. |

When the component is destroyed, the chat drops its connection and keeps its messages. When you are done with the chat, call `dispose()` yourself.

### Example: tool approval

A tool with `needsApproval: true` pauses the run. The pending call shows up in `interrupts`.

```svelte
<script lang="ts">
  import { toolDefinition } from "@tanstack/ai";
  import { createChat, fetchServerSentEvents } from "@tanstack/ai-svelte";
  import { z } from "zod";

  const deleteFileTool = toolDefinition({
    name: "delete_file",
    description: "Delete a file",
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  });

  const chat = createChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
    tools: [deleteFileTool],
  });
</script>

{#each chat.interrupts as interrupt (interrupt.id)}
  {#if interrupt.kind === "tool-approval"}
    <div>
      <p>Approve: {interrupt.toolName}</p>
      <button onclick={() => interrupt.resolveInterrupt(true)}>Approve</button>
      <button onclick={() => interrupt.resolveInterrupt(false)}>Deny</button>
    </div>
  {/if}
{/each}
```

See [Tool Approval](../interrupts/tool-approval) for the server side.

## `createChatHook(options)`

Binds chat options once at module scope and returns a `createChat` factory that uses them.

```ts
import { createChatHook, fetchServerSentEvents } from "@tanstack/ai-svelte";

export const { createChat: createSupportChat } = createChatHook({
  connection: fetchServerSentEvents("/api/chat"),
});

// In a component: const chat = createSupportChat({ threadId: "support-1" })
```

The bound factory takes these per-call overrides: `threadId`, `initialMessages`, `live`, and `forwardedProps`. Keep `tools`, `interrupts`, and `outputSchema` on the factory options.

`@tanstack/ai-svelte/ui` has its own `createChatHook` that also returns typed UI components. See [Svelte Chat UI](../ui/svelte).

## Generation hooks

Each factory runs one generation request and keeps its result. See [Generation Hooks](../media/generation-hooks).

| Factory | `generate()` input | `result` |
| --- | --- | --- |
| `createGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `createGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `createGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `createTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `createSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `createGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `createGeneration` | Your own input type | Your own result type |

```svelte
<script lang="ts">
  import { createGenerateImage, fetchServerSentEvents } from "@tanstack/ai-svelte";

  const image = createGenerateImage({
    connection: fetchServerSentEvents("/api/generate/image"),
    threadId: "image-studio",
  });
</script>

<button
  disabled={image.isLoading}
  onclick={() => image.generate({ prompt: "A mountain at sunset" })}
>
  Generate
</button>
```

Options: `threadId` (required), `connection` or `fetcher`, `body`, `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.

Returns: `generate(input)`, `result`, `isLoading`, `error`, `status`, `stop()`, `reset()`, `runId`, `updateBody(body)`, and `dispose()`. The state fields are reactive getters. The factories do not clean up on their own. When you are done, call `dispose()`.

`createGenerateVideo` also returns `jobId` and `videoStatus`, and takes `onJobCreated` and `onStatusUpdate`.

## Realtime chat

This package does not export a realtime factory. Use `RealtimeClient`, which this package re-exports. See [Realtime Chat](../media/realtime-chat).

## `createAudioRecorder(options?)`

Records audio from the microphone. See [Audio Recording](../media/audio-recording).

Returns `recording`, `isRecording`, `isSupported` (reactive getters), `start()`, `stop()`, and `cancel()`. Pass `onComplete` to transform the recording. Then `recording` and `stop()` use the transformed type.

## `createByok(client)`

Subscribes to a BYOK keyring. The return value has a reactive `snapshot` getter. See [Bring Your Own Key](../advanced/byok).

```svelte
<script lang="ts">
  import { createByok } from "@tanstack/ai-svelte";
  import { byok } from "./byok";

  const byokState = createByok(byok);
  const openai = $derived(byokState.snapshot.status.openai);
</script>

<p>{openai && "masked" in openai ? openai.masked : "No key"}</p>
```

Keep the object and read `byokState.snapshot` in markup or `$derived`. If you destructure `snapshot`, you keep only the first value. The snapshot has `status`, `locked`, `prompt`, and `storageError`. Save a key from your own UI with `byok.update(provider, value)`.

## MCP App bridge

This package does not export a bridge factory. Use `createMcpAppBridge`, which this package re-exports. See [MCP Apps](../mcp/apps).

## `createRegisterWebMCPTools(tools, options?)`

Exposes client tools to the browser WebMCP API. Call it during component init. Svelte removes the tools when the component is destroyed. See [WebMCP Tools](../tools/webmcp).

```svelte
<script lang="ts">
  import { createRegisterWebMCPTools } from "@tanstack/ai-svelte";
  import { searchProducts } from "./tools";

  createRegisterWebMCPTools([searchProducts], {
    onError: (error) => console.error(error),
  });
</script>
```

Options: `toolOptions`, `context`, and `onError`. `context` is required when a tool declares a required runtime context.

## `createPageWebMCPTools(options?)`

Reads the WebMCP tools that the page registered, as client tools. The `tools` field starts empty and updates when the page adds or removes a tool. Read it in a `get tools()` getter on `createChat`. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

```svelte
<script lang="ts">
  import { createPageWebMCPTools } from "@tanstack/ai-svelte";

  const page = createPageWebMCPTools({
    filter: (tool) => tool.origin === location.origin,
  });
</script>

<p>{page.tools.length} page tools</p>
```

Options: `filter` (return `false` to skip a tool) and `onError`.

## Re-exports from `@tanstack/ai-client`

You can import these from `@tanstack/ai-svelte` directly. See [`@tanstack/ai-client`](./ai-client) for details.

| Group | Exports |
| --- | --- |
| Connection adapters | `fetchServerSentEvents`, `fetchHttpStream`, `fetchJson`, `xhrServerSentEvents`, `xhrHttpStream`, `webSocket`, `stream`, `rpcStream` |
| Typed options | `createChatClientOptions`, `clientTools` |
| Persistence | `localStoragePersistence`, `sessionStoragePersistence`, `indexedDBPersistence` |
| Clients | `ChatClient`, `GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, `AudioRecorder`, `InterruptManager` |
| WebMCP and MCP Apps | `registerWebMCPTools`, `getWebMCPTools`, `subscribeWebMCPTools`, `createMcpAppBridge` |
| Errors | `UnsupportedResponseStreamError`, `StreamTruncatedError`, `DurableStreamIncompleteError`, `StreamReconnectLimitError`, `StorageUnavailableError` |
| Stream helpers | `StreamProcessor`, chunk strategies, `parsePartialJSON`, message converters |

BYOK helpers (`defineByok`, `defaultByokStorage`, and more) are on the `@tanstack/ai-svelte/byok` subpath.

## Types

| Type | What it is |
| --- | --- |
| `CreateChatOptions`, `CreateChatReturn` | The options and return value of `createChat`. |
| `UIMessage<TTools>` | A chat message with typed parts. |
| `InferChatMessages<T>` | The message type for a `createChatClientOptions` result. |
| `SendMessageOptions`, `WhenBusy`, `QueueOption`, `QueuedMessage` | Send and queue types. |
| `DeepPartial<T>` | The type of `partial` while structured output streams. |
| `Create<Factory>Options`, `Create<Factory>Return` | Options and return types for the generation and recorder factories. The WebMCP factories export only an options type. |

Pass a plain tools array to `createChat` or `createChatClientOptions`. Tool names, inputs, and outputs stay typed without `as const`. Import `toolDefinition` from `@tanstack/ai`.
