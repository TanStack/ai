---
title: "@tanstack/ai-client"
slug: /api/ai-client
order: 2
description: "API reference for @tanstack/ai-client: ChatClient, connection adapters, generation clients, and BYOK, with no UI framework."
keywords:
  - tanstack ai
  - "@tanstack/ai-client"
  - headless client
  - ChatClient
  - chat state
  - connection adapters
  - api reference
---

The headless client under every framework package. Use it directly for vanilla JavaScript or a custom binding. For typed chat UI types and selectors, import `@tanstack/ai-client/ui` and see [Custom Chat UI Adapters](../ui/custom-adapters).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-client
vue: @tanstack/ai-client
solid: @tanstack/ai-client
svelte: @tanstack/ai-client
preact: @tanstack/ai-client
angular: @tanstack/ai-client
vanilla: @tanstack/ai-client
octane: @tanstack/ai-client

<!-- ::end:tabs -->

## `ChatClient`

Holds the messages and the run state of one chat, and talks to your server route.

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  threadId: "support-chat",
});

const unsubscribe = client.subscribeSnapshot(() => {
  const { messages, isLoading } = client.getSnapshot();
  console.log(messages.length, isLoading);
});

client.attach();
await client.sendMessage("Hello!");
```

### Lifecycle: `attach()` and `detach()`

A new client opens no connection. When your view appears, call `attach()`. When it goes away, call `detach()`. The framework hooks do this for you on mount and unmount.

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  threadId: "thread-1",
  persistence: true,
});

client.attach(); // rejoin a run in progress, and load the thread
client.detach(); // drop the connection, keep the messages and the run pointer
```

The connection follows the view because a browser allows only about six connections to one origin. A chat that follows a run holds one connection for as long as the run lasts. If every chat on a page held one, the other requests wait behind them.

- `attach()` is safe to call more than once. A second call does nothing.
- `detach()` keeps the messages, the resume pointer, and the run id. The run goes on at the server, and a later `attach()` picks it up from the durable log.
- `detach()` does not end the run (that is `stop()`) or the client (that is `dispose()`).
- A chat with no persistence has nothing to rejoin, so `attach()` sends no request.

### Constructor options

You must pass `threadId`. You must also pass `connection` or `fetcher`, not both.

| Option | What it does |
| --- | --- |
| `connection` | Connection adapter. See [Connection adapters](#connection-adapters). |
| `fetcher` | A function that gets `{ messages, data, threadId, runId, ... }` and an abort `signal`, and returns a `Response` or a stream. Use it with server functions. |
| `tools` | Client tools from `.client()`. The client runs them when the model calls them. See [Client Tools](../tools/client-tools). |
| `threadId` | Required. The id of this chat. Use a stable id for each conversation, for example the id from your route. |
| `persistence` | `true` to load the thread from the server, or a storage adapter. See [Chat Persistence](../persistence/chat-persistence). |
| `history` | `{ pageSize }`: load only the newest messages first. Only with `persistence: true`. |
| `initialMessages` | The messages to show first. |
| `forwardedProps` | JSON sent to the server in the AG-UI `RunAgentInput.forwardedProps` field. |
| `context` | Client-only runtime context for client tools. It is not sent to the server. |
| `queue` | What `sendMessage` does while a run is busy: `"queue"` (default), `"drop"`, `"interrupt"`, a config, or a function. See [Queueing](../chat/queueing). |
| `interrupts` | Definitions from `defineInterrupt()`. See [Interrupts](../interrupts/overview). |
| `byok` | A keyring from [`defineByok`](#definebyok). The client sends the key in `x-byok-*` headers, never in the body. |
| `byokProvider` | A function that returns the provider slug for this chat. If it returns nothing, the client uses `provider` from the merged `forwardedProps` and send `body`. If no slug resolves, the send throws. It does not send every stored key. |
| `streamProcessor` | `{ chunkStrategy }`. Controls when text updates are applied. Default: `ImmediateStrategy`, every chunk. |
| `initialResumeSnapshot` | A saved resume state to restore pending interrupts after a reload. |
| `devtools`, `devtoolsBridgeFactory` | Devtools metadata, and the bridge factory from `@tanstack/ai-client/devtools`. |

Callbacks:

| Callback | When it runs |
| --- | --- |
| `onResponse`, `onChunk`, `onFinish`, `onError` | When a response arrives, a chunk arrives, a response ends, or an error occurs. |
| `onMessagesChange`, `onLoadingChange`, `onErrorChange`, `onStatusChange` | When that piece of state changes. |
| `onSubscriptionChange`, `onConnectionStatusChange`, `onSessionGeneratingChange` | When the live subscription changes. |
| `onHydratingChange` | When loading from persistence starts or stops. |
| `onQueueChange`, `onRunIdChange` | When the queue or the run id changes. |
| `onInterruptStateChange` | When interrupt state changes. The second argument is `{ source: "hydrate" }` for restored state and `{ source: "live" }` otherwise. |
| `onResumeStateChange` | When the resume state or pending interrupts change. |
| `onCustomEvent` | When a server tool calls `emitCustomEvent()`. See [Custom Events](../protocol/custom-events). |

### Methods

| Method | What it does |
| --- | --- |
| `sendMessage(content, body?, sendOptions?)` | Sends a user message and starts a run. |
| `append(message)` | Adds a `UIMessage` or `ModelMessage` and starts a run. |
| `reload()` | Removes the answer after the last user message and runs that message again. |
| `stop()` | Aborts the request in flight. Client tool results for that turn are ignored. |
| `clear()` | Clears all messages. |
| `setMessagesManually(messages)` | Replaces the messages. |
| `addToolResult(result)` | Gives a client tool result by hand: `{ toolCallId, tool, output, state?, errorText? }`. |
| `attach()`, `detach()` | Start and stop the connection for a view. |
| `subscribe(options?)`, `unsubscribe()` | Start and stop the live subscription loop. |
| `getSnapshot()`, `subscribeSnapshot(listener)` | Read the UI state, and listen for changes. |
| `getInterrupts()` | Pending interrupts, each with `resolveInterrupt(...)`. |
| `resolveInterrupts(...)`, `cancelInterrupts()`, `retryInterrupts()`, `resumeInterruptsUnsafe(resume, state?)` | Act on all pending interrupts at once. |
| `cancelQueued(id)`, `getQueue()` | Cancel or read queued messages. |
| `loadOlderMessages()`, `getHasOlderMessages()` | Page in older messages. |
| `updateOptions(options)` | Change the transport, `forwardedProps`, `tools`, `context`, `queue`, BYOK, or callbacks. |
| `dispose()` | Ends the client: stops the subscription and releases devtools. |

Read single values with `getMessages()`, `getIsLoading()`, `getStatus()`, `getError()`, `getIsHydrating()`, `getIsSubscribed()`, `getConnectionStatus()`, `getSessionGenerating()`, and `getCurrentRunId()`.

#### `sendMessage(content, body?, sendOptions?)`

`content` is a string or `MultimodalContent`: `{ content, id?, metadata? }`. Use the object form to put `metadata` on the user `UIMessage`. TanStack writes the `tanstack` key in `metadata`. Your keys stay at the top level.

`body` and `sendOptions.body` are extra JSON for this request. They shallow-merge with the chat `forwardedProps`. On a key collision, `sendOptions.body` wins. `sendOptions.whenBusy` overrides the queue policy for this send.

The framework hooks expose `sendMessage(content, sendOptions)` with no positional `body`. Pass `{ body }` there.

```typescript
import { client } from "./client";

await client.sendMessage({
  content: "Summarize the attached files",
  metadata: { author: { id: "user-42", name: "Dana" } },
});

await client.sendMessage("Summarize the attached files", undefined, {
  body: { attachmentIds: ["att_1", "att_2"] },
  whenBusy: "interrupt",
});
```

On the server, read the merged JSON from `chatParamsFromRequest`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, forwardedProps, threadId } = await chatParamsFromRequest(request);
  const attachmentIds = forwardedProps.attachmentIds;
  if (Array.isArray(attachmentIds)) {
    // Look up the uploads. Do not add them to `messages`.
  }
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
  });
  return toServerSentEventsResponse(stream);
}
```

If `append()` starts the stream, it resolves after the full HTTP response is processed. If a stream is already in progress, the call queues the send, and the promise can resolve before the queued response is processed. A `RUN_FINISHED` with `finishReason: "tool_calls"` does not end the wait when the agent loop goes on in the same response.

`append()` copies `metadata` from a `UIMessage` onto the stored message.

After `stop()`, a later `addToolResult()` for the stopped turn is ignored. A new user message starts a new turn, and `addToolResult()` applies to that turn.

#### `getSnapshot()` and `subscribeSnapshot(listener)`

The snapshot has `messages`, `status`, `isLoading`, `error`, `queue`, `runId`, `isSubscribed`, `connectionStatus`, `sessionGenerating`, `hasOlderMessages`, `isHydrating`, and `interruptState`.

- The snapshot, `messages`, `queue`, and their entries are frozen copies. `messages.push` throws. Use `setMessagesManually`.
- `interruptState` is not copied.
- `subscribeSnapshot(listener)` returns an unsubscribe function. It does not fire with the current value, so read `getSnapshot()` first.
- `subscribeSnapshot` is not `subscribe()`. `subscribe()` starts the live connection loop.

## Connection adapters

Each adapter pairs with a server response helper from `@tanstack/ai`. See [Transports](../transports/overview).

| Adapter | Server pair | Use it when |
| --- | --- | --- |
| `fetchServerSentEvents(url, options?)` | `toServerSentEventsResponse()` | Default for browsers. |
| `fetchHttpStream(url, options?)` | `toHttpResponse()` | You want newline-delimited JSON. |
| `fetchJson(url, options?)` | `toJsonResponse()` | The host cannot stream. See [JSON](../transports/json). |
| `xhrHttpStream(url, options?)` | `toHttpResponse()` | React Native and Expo. See [React Native](../transports/react-native). |
| `xhrServerSentEvents(url, options?)` | `toServerSentEventsResponse()` | XHR progress events work better than streaming `fetch`. |
| `webSocket(url, options?)` | `toWebSocketResponse()` | You want one socket for many runs. See [WebSockets](../transports/websockets). |
| `stream(factory)`, `rpcStream(call)` | Any `AsyncIterable<StreamChunk>` | You call a server function directly. See [Server Functions](../transports/server-functions). |

```typescript
import { fetchServerSentEvents } from "@tanstack/ai-client";

const connection = fetchServerSentEvents("/api/chat", {
  headers: { Authorization: "Bearer token" },
});
```

`url` can be a string or a function that returns one. `options` can be an object or a function that returns one per request.

### Adapter options

Fetch adapters take `headers`, `credentials`, `signal`, `body`, `fetchClient`, and `reconnect`.

XHR adapters take `headers`, `withCredentials`, `signal`, `body`, `xhrFactory`, and `reconnect`.

`fetchJson()` also takes `pollIntervalMs` (default 250). When a reply has `done: false`, it waits that long and sends `GET ?runId=<id>&offset=<offset>`. Serve that `GET` with `resumeJsonResponse()`.

The adapter `body` merges into the AG-UI `forwardedProps`. The chat `forwardedProps` and the per-send `body` override it.

`fetchHttpStream()` needs streaming `fetch`, `Response.body.getReader()`, and `TextDecoder`. If the runtime has none of these, it throws `UnsupportedResponseStreamError`. Use the XHR adapters in React Native and Expo.

### `stream(factory)`

Builds a custom adapter from a function that returns `AsyncIterable<StreamChunk>`. The function gets `(messages, data, abortSignal, input)`. `data` is the merged `forwardedProps`. `input` is the AG-UI `RunAgentInput` for the run, the same body the HTTP adapters send. Read it on the server with `chatParamsFromRequestBody`.

```typescript
import { stream } from "@tanstack/ai-client";
import { chatOnServer } from "./server";

const connection = stream((_messages, _data, signal, input) =>
  chatOnServer({ input, signal }),
);
```

### Stream errors

- `UnsupportedResponseStreamError`: a fetch adapter found no `Response.body`, `getReader()`, or `TextDecoder`.
- `StreamTruncatedError`: an SSE or NDJSON stream ended in the middle of a line. A server, a proxy, or the network cut the connection.
- `DurableStreamIncompleteError` and `StreamReconnectLimitError`: a resumable stream did not finish. See [Resumable Streams](../resumable-streams/overview).

## Persistence adapters

Browser storage adapters for `persistence`. Each one keeps the messages and the resume state for a `threadId`. See [Client Persistence](../persistence/client-persistence).

| Adapter | Storage |
| --- | --- |
| `localStoragePersistence(options?)` | `localStorage` |
| `sessionStoragePersistence(options?)` | `sessionStorage` |
| `indexedDBPersistence(options?)` | IndexedDB. The default `databaseName` is `"tanstack-ai"`. |

They throw `StorageUnavailableError` when the browser storage is not available.

## `createChatClientOptions(options)`

Returns the options unchanged, with full type inference. Use it to define options outside a hook and to get the message type.

```typescript
import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { searchProducts } from "./tools";

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  threadId: "support-chat",
  tools: [searchProducts],
});

type ChatMessages = InferChatMessages<typeof chatOptions>;
```

A plain tools array keeps tool names, inputs, and outputs typed. You do not need `as const`. When you narrow with `part.name === "searchProducts"`, `part.input` and `part.output` get their types from the schemas of that tool.

Client context stays typed too. If a `.client<ClientContext>()` tool needs context, `context` becomes required. It stays on the client. To send values to the server, use `forwardedProps`, then validate them and pass them to `chat({ context })`.

## `clientTools(...tools)`

Returns its arguments as a typed tuple. A plain array already gives the same types, so use this only to build a shared tools tuple outside the options call.

```typescript
import { clientTools } from "@tanstack/ai-client";
import { searchProducts, showToast } from "./tools";

export const tools = clientTools(searchProducts, showToast);
```

## `GenerationClient`

Runs one generation request (image, audio, speech, transcription, summary, or your own type) and keeps its result. The framework generation hooks wrap it. See [Generation Hooks](../media/generation-hooks).

```typescript
import type { ImageGenerationResult } from "@tanstack/ai";
import {
  GenerationClient,
  fetchServerSentEvents,
  type ImageGenerateInput,
} from "@tanstack/ai-client";

const generation = new GenerationClient<ImageGenerateInput, ImageGenerationResult>({
  connection: fetchServerSentEvents("/api/generate/image"),
  threadId: "generation",
  onResult: (result) => console.log(result.images.length),
});

await generation.generate({ prompt: "A mountain at sunset" });
```

- Options: `threadId` (required), `connection` or `fetcher`, `body`, `persistence`, `byok`, `byokProvider`, `devtools`, `onResult`, `onError`, `onProgress`, `onChunk`.
- Methods: `generate(input)`, `stop()`, `reset()`, `updateOptions(options)`, `dispose()`, `getResult()`, `getIsLoading()`, `getError()`, `getStatus()`.
- Snapshot: `result`, `isLoading`, `error`, `status` (`"idle"`, `"generating"`, `"success"`, or `"error"`), and `runId`.

`VideoGenerationClient` does the same for video jobs. Its snapshot adds `jobId` and `videoStatus`, and it takes `onJobCreated` and `onStatusUpdate`.

## `RealtimeClient`

Runs a voice conversation with a realtime model. Pass `getToken` and `adapter`. Methods: `connect()`, `disconnect()`, `startListening()`, `stopListening()`, `interrupt()`, `sendText(text)`, `sendImage(data, mimeType)`, `updateSession(config)`, and `destroy()`. See [Realtime Chat](../media/realtime-chat).

When `connect()` succeeds, it clears the previous transcript. A transcript that arrives while the microphone starts is kept. A failed connection keeps the previous transcript. Snapshot `parts` are frozen at runtime, but their TypeScript type stays mutable. Tool `input`, `output`, and subagent transcripts on a snapshot are copies.

## `AudioRecorder`

Records audio from the microphone. Methods: `start()`, `stop()` (resolves to the recording), and `cancel()`. See [Audio Recording](../media/audio-recording).

### Listeners on the other clients

`GenerationClient`, `VideoGenerationClient`, `RealtimeClient`, and `ByokClient` use `subscribe(listener)` and `getSnapshot()`:

- The listener gets no argument. Call `getSnapshot()` inside it.
- A listener that throws does not stop the other listeners. The error goes to `reportError` in the browser and to `console.error` in other runtimes.

`AudioRecorder.subscribe` passes the new state: `subscribe((state) => ...)`. `getSnapshot()` returns that same state.

## `registerWebMCPTools(tools, options)`

Exposes client tools through the browser WebMCP API. Abort `options.signal` to remove the tools. See [WebMCP Tools](../tools/webmcp).

```typescript
import { registerWebMCPTools } from "@tanstack/ai-client";
import { searchProducts } from "./tools";

const controller = new AbortController();

await registerWebMCPTools([searchProducts], {
  signal: controller.signal,
  toolOptions: {
    searchProducts: {
      title: "Search products",
      annotations: { readOnlyHint: true },
    },
  },
});

// Later, when the owner of these tools goes away:
controller.abort();
```

| Option | What it does |
| --- | --- |
| `signal` | Required. Aborting it removes all tools of this call. |
| `toolOptions` | Per tool name: `title` and `annotations` (`readOnlyHint`, `untrustedContentHint`). |
| `context` | Client tool runtime context. Required when a tool declares a required context. |

- It returns `Promise<void>`. During server rendering, in an insecure context, or when WebMCP is not there, it resolves and registers nothing.
- It validates Standard Schema inputs and outputs.
- A tool with `needsApproval: true` makes the registration fail. If registration fails, the function removes the tools it registered during the call.

Option types: `RegisterWebMCPToolsOptions`, `WebMCPToolOptionsByName`, `WebMCPToolOptions`, `WebMCPToolAnnotations`.

## `getWebMCPTools(options?)` and `subscribeWebMCPTools(listener, options)`

Read the tools that the page registered with WebMCP, as client tools. See [Page WebMCP Tools in Chat](../tools/webmcp-page-tools).

- `getWebMCPTools({ filter? })` resolves to the current tools, or `[]` when WebMCP is not there.
- `subscribeWebMCPTools(listener, { signal, filter?, onError? })` calls `listener` with the tools each time the page adds or removes one. Abort `signal` to stop.

`filter` gets a `WebMCPPageTool` (`name`, `title`, `description`, `inputSchema`, `origin`, `annotations`). Return `false` to skip it.

## `createMcpAppBridge(options)`

Creates the bridge that lets an MCP App widget call tools and send chat messages. Options: `threadId`, `callEndpoint`, `chat`, `fetchImpl`, `onLink`. See [MCP Apps](../mcp/apps).

## `defineByok`

Creates a headless BYOK keyring. Import it from `@tanstack/ai-client/byok`. Pass the keyring to `ChatClient`, `useChat`, or a generation hook. See [Bring Your Own Key](../advanced/byok).

```typescript
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
});
```

### Factory options

- `storage`: a `KeyringStorage`. Default: `memoryStorage()`, which keeps keys for the session only.
- `providers`: descriptors whose `with` companions the keyring adds. With `[cloudflareByok, cloudflareAccountByok]`, a send for `cloudflare` carries the token and the account id headers. `prepare` asks for each missing one.

### Methods

| Method | What it does |
| --- | --- |
| `update(provider, key)` | Saves a key for a provider slug (`[a-z][a-z0-9-]{0,63}`), then updates the snapshot. Throws if the id is not a slug, the key is empty, or storage fails. |
| `update(key)` | Saves a key for the current `prompt` provider. Throws if `prompt` is null. |
| `clear(provider?)` | Removes one key, or all keys when you omit `provider`. |
| `unlock()` | Decrypts unlockable storage (passkey). Does nothing for memory storage. |
| `headers(provider)` | Returns the `x-byok-*` headers for that slug and its companions. |
| `prepare(provider?)` | Waits for hydration, then unlocks if needed. If the key for `provider` or a companion is empty and the server does not cover it, it throws `ByokBlockedError` and sets `prompt`. |
| `ready()` | Resolves when the first load from storage ends. |
| `setServerCoverage(flags)` | `true`: do not block a send when the browser has no key, because the relay can use its env. `false`: block (default). A record sets flags per slug. |
| `request(provider, reason)` | Sets `prompt` to `{ provider, reason }`. `reason` is `"missing"`, `"locked"`, or `"invalid"`. |
| `getSnapshot()`, `subscribe(listener)` | Read the [snapshot](#snapshot), and listen for changes. |
| `keys()` | Returns a copy of the raw keyring. Do not show it in the UI. |

The chat and generation clients throw if no provider slug resolves. They do not send every stored key.

### Snapshot

```typescript ignore
type ByokSnapshot = {
  status: Partial<Record<string, KeyStatus>>;
  locked: boolean;
  prompt: { provider: string; reason: "missing" | "locked" | "invalid" } | null;
  storageError: string | null;
};

type KeyStatus =
  | { state: "empty" }
  | { state: "set"; masked: string }
  | { state: "locked"; masked: string }
  | { state: "validating"; masked: string }
  | { state: "valid"; masked: string }
  | { state: "invalid"; masked: string }
  | { state: "error"; masked: string; message: string };
```

- `status` is sparse. Only slugs with a key, a lock, or a validation result appear. A missing entry means no key.
- `masked` is the last four characters of the key. `{ state: "empty" }` has no `masked`, so check with `"masked" in status`.
- `storageError` is set when loading from storage fails.
- The snapshot never holds the raw key.

### Storage

| Storage | What it does |
| --- | --- |
| `defaultByokStorage(options?)` | Passkey-encrypted IndexedDB when WebAuthn is available in a secure context. Otherwise `memoryStorage()`, with a warning. The first save still throws if the authenticator has no PRF support. |
| `memoryStorage()` | Keeps keys on the `ByokClient` instance. Keys are gone when the page reloads. |
| `passkeyStorage(options?)` | Encrypts the keyring with a WebAuthn passkey. The first save throws if the authenticator has no PRF support. |
| `KeyringStorage` | The storage interface: `{ id, label, persistent, unlockable?, peek?, load, save, clear }`. |

The library ships no key dialog. Call `byok.update(provider, value)` from your own UI.

## Types

### `UIMessage`

```typescript ignore
interface UIMessage<TTools = any> {
  id: string;
  role: "system" | "user" | "assistant" | "activity";
  name?: string;
  parts: Array<MessagePart<TTools>>;
  createdAt?: Date;
  metadata?: Record<string, any>;
}
```

`metadata` is an AG-UI bag. TanStack writes the `tanstack` key. Your keys stay at the top level.

### `MessagePart`

| Part | `type` | What it holds |
| --- | --- | --- |
| `TextPart` | `"text"` | `content`: the text. |
| `ThinkingPart` | `"thinking"` | `content`: the model reasoning. See [Thinking Content](../chat/thinking-content). |
| `ToolCallPart` | `"tool-call"` | `id`, `name`, `arguments` (JSON string, can be partial while it streams), `input`, `output`, `state`, and `approval` for tools with `needsApproval: true`. |
| `ToolResultPart` | `"tool-result"` | `toolCallId`, `content`, `state`, `error`, `outcome`, `metadata`. |
| `ImagePart`, `AudioPart`, `VideoPart`, `DocumentPart` | media types | Media content. See [Multimodal Content](../advanced/multimodal-content). |
| `StructuredOutputPart` | `"structured-output"` | Typed `data` and `partial`. See [Structured Outputs](../structured-outputs/overview). |
| `ActivityPart`, `UIResourcePart`, `SubagentPart` | other | Activity records, MCP App resources, and subagent runs. |

Thinking parts are for the UI only. The client does not send them back to the model.

With a typed tools array, `ToolCallPart` is a union with `name` as the key. Narrow on `part.name` to get typed `input` and `output`. The `approval` field exists only on tools with `needsApproval: true`, so narrow by `part.name` or check `"approval" in part` first.

### States

```typescript ignore
type ToolCallState =
  | "awaiting-input"
  | "input-streaming"
  | "input-complete"
  | "approval-requested"
  | "approval-responded"
  | "complete"
  | "error";

type ToolResultState = "streaming" | "complete" | "error";
```
