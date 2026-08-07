---
title: "@tanstack/ai-client"
slug: /api/ai-client
order: 2
description: "Headless ChatClient, connection adapters, and typed helpers for any framework."
keywords:
  - tanstack ai
  - "@tanstack/ai-client"
  - headless client
  - ChatClient
  - chat state
  - connection adapters
  - api reference
---

If you need chat state without a framework, or to build a custom UI → use `ChatClient`.

```bash
npm install @tanstack/ai-client
```

Framework hooks (`@tanstack/ai-react`, `-vue`, `-solid`, `-svelte`, `-preact`, `-angular`) wrap this client and call `attach()` / `detach()` for you.

## Quick start

1. Create a client with a connection adapter.
2. Call `attach()` when the view appears.
3. Call `sendMessage()` / `stop()` / etc.
4. Call `detach()` when the view goes away (not `stop()` — that ends the run).

```typescript group=ai-client
import {
  ChatClient,
  fetchServerSentEvents,
  type UIMessage,
} from "@tanstack/ai-client";
import { myClientTool } from "./tools";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  initialMessages: [],
  tools: [myClientTool],
  onMessagesChange: (messages: UIMessage[]) => {
    console.log("Messages updated:", messages);
  },
});

client.attach();
```

### Why attach/detach?

Browsers limit ~6 connections per origin. A tailing chat holds one slot for the whole run. Attach only while a view is watching; detach drops the socket but keeps transcript + resume pointer so re-attach can rejoin.

| Method | Effect |
| --- | --- |
| `attach()` | Start tailing; rejoin in-progress run; load thread if persisted. Idempotent. |
| `detach()` | Drop connection; keep messages, run id, resume pointer. Not `stop()` or `dispose()`. |
| `stop()` | End the current generation. |

No persistence → `attach()` issues no request.

**Migration:** older versions tailed in the constructor. If you use `ChatClient` directly, add `attach()` / `detach()` at view mount/unmount. Framework hooks need no change.

---

## Constructor options

### Required / core

- `connection` — streaming adapter
- `tools?` — `.client()` tools (auto-executed on match)
- `initialMessages?` / `id?` / `threadId?` — seed + AG-UI thread (auto thread id if omitted)
- `forwardedProps?` — client JSON → server `RunAgentInput.forwardedProps`
- `context?` — client-local typed context for client tools (not sent to server)

### Callbacks & processing

- `onResponse?` / `onChunk?` / `onFinish?` / `onError?`
- `onMessagesChange?` / `onLoadingChange?` / `onErrorChange?`
- `streamProcessor?` — chunk strategy config
- `body?` — **Deprecated.** Prefer `forwardedProps` (still merged on the wire + legacy `data` mirror)

---

## Methods

### `sendMessage(content)`

```typescript group=ai-client
await client.sendMessage("Hello!");
```

### `append(message)`

```typescript group=ai-client
await client.append({ role: "user", content: "Additional context" });
```

### `reload()` / `stop()` / `clear()`

```typescript group=ai-client
await client.reload();
client.stop();
client.clear();
```

### `setMessagesManually(messages)`

```typescript group=ai-client
const newMessages: UIMessage[] = [];
client.setMessagesManually([...newMessages]);
```

### Tool result / approval

```typescript group=ai-client
await client.addToolResult({
  toolCallId: "call_123",
  tool: "toolName",
  output: { result: "..." },
  state: "output-available",
});

await client.addToolApprovalResponse({
  id: "approval_123",
  approved: true,
});
```

### Properties

- `messages` — current `UIMessage[]`
- `isLoading` — generation in flight
- `error` — current error, if any

---

## Connection adapters

Full guide: [Connection Adapters](../chat/connection-adapters). React Native: [Quick Start: React Native](../getting-started/quick-start-react-native).

### Pick an adapter

| Need | Adapter | Pair with (server) |
| --- | --- | --- |
| Browser SSE | `fetchServerSentEvents` | `toServerSentEventsResponse()` |
| Browser NDJSON | `fetchHttpStream` | `toHttpResponse()` |
| React Native / Expo (default) | `xhrHttpStream` | `toHttpResponse()` |
| RN SSE | `xhrServerSentEvents` | `toServerSentEventsResponse()` |
| Custom | `stream(connectFn)` | your protocol |

`fetchHttpStream` needs streaming `fetch` + `getReader()` + `TextDecoder`. Missing support → `UnsupportedResponseStreamError` — use XHR adapters on RN/Expo.

### Examples

```typescript
import {
  fetchServerSentEvents,
  fetchHttpStream,
  xhrHttpStream,
  xhrServerSentEvents,
  stream,
} from "@tanstack/ai-client";

const sse = fetchServerSentEvents("/api/chat", {
  headers: { Authorization: "Bearer token" },
});

const http = fetchHttpStream("/api/chat");

const xhrHttp = xhrHttpStream("http://192.168.1.10:8787/chat/http", {
  headers: { Authorization: "Bearer token" },
  withCredentials: true,
});

const xhrSse = xhrServerSentEvents("http://192.168.1.10:8787/chat/sse");
```

Custom adapter (illustrative — return an `AsyncIterable` of AG-UI events):

```typescript ignore
import { stream } from "@tanstack/ai-client";

const custom = stream(async (messages, data, signal) => {
  // `data` is merged forwardedProps
  const response = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages, forwardedProps: data }),
    signal,
  });
  return processStream(response);
});
```

### Adapter options

**Fetch:** `headers?`, `credentials?`, `signal?`, `body?`, `fetchClient?`

**XHR:** `headers?`, `withCredentials?`, `signal?`, `body?`, `xhrFactory?`

`body` merges into AG-UI `forwardedProps`. Client `forwardedProps` and per-message `sendMessage(..., data)` override static adapter `body`.

### Stream errors

- `UnsupportedResponseStreamError` — no streaming body/reader/decoder
- `StreamTruncatedError` — stream ended mid-line

---

## Helpers

### `clientTools(...tools)`

Optional. A plain array already narrows types. Use this for an explicit reusable tools tuple.

```typescript
import {
  clientTools,
  createChatClientOptions,
  fetchServerSentEvents,
  type UIMessage,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const messages: UIMessage[] = [];

const myTool1 = toolDefinition({
  name: "myTool1",
  description: "First tool",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

const tool1Client = myTool1.client((input) => {
  return { result: input.query };
});

const tools = clientTools(tool1Client);

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools,
});

messages.forEach((message) => {
  message.parts.forEach((part) => {
    if (part.type === "tool-call" && part.name === "myTool1") {
      // part.input / part.output typed from schemas
    }
  });
});
```

### `createChatClientOptions(options)`

Preserve tool + context types for `InferChatMessages`.

```typescript
import {
  createChatClientOptions,
  fetchServerSentEvents,
  type InferChatMessages,
} from "@tanstack/ai-client";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

type ClientContext = { activeProjectId: string };

const projectTool = toolDefinition({
  name: "projectAction",
  description: "Run a project action",
  inputSchema: z.object({ action: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
});

const tool = projectTool.client<ClientContext>((input, ctx: { context: ClientContext }) => {
  console.log(ctx.context.activeProjectId, input.action);
  return { ok: true };
});

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents("/api/chat"),
  tools: [tool],
  context: { activeProjectId: "project_123" },
});

type ChatMessages = InferChatMessages<typeof chatOptions>;
```

Client `context` stays local. For server values, send `forwardedProps`, then map into server `chat({ context })`.

---

## Types

### `UIMessage` / parts

```typescript ignore
interface UIMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}

type MessagePart = TextPart | ThinkingPart | ToolCallPart | ToolResultPart;
```

```typescript
interface TextPart {
  type: "text";
  content: string;
}

interface ThinkingPart {
  type: "thinking";
  content: string;
}
```

Thinking is UI-only (not resent to the model). Only models with reasoning/thinking support emit it.

### `ToolCallPart` / states

```typescript ignore
interface ToolCallPart {
  type: "tool-call";
  id: string;
  name: string;
  arguments: string; // may be incomplete while streaming
  input?: any; // typed from inputSchema
  state: ToolCallState;
  approval?: ApprovalRequest; // only if needsApproval: true
  output?: any; // typed from outputSchema
}

type ToolCallState =
  | "awaiting-input"
  | "input-streaming"
  | "input-complete"
  | "approval-requested"
  | "approval-responded"
  | "complete";

type ToolResultState = "streaming" | "complete" | "error";
```

With a typed `tools` array, narrow on `part.name` for `input` / `output` / `approval`.

### `ToolResultPart`

```typescript ignore
interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  content: string;
  state: ToolResultState;
  error?: string;
}
```

---

## Stream processing

```typescript
import {
  ChatClient,
  ImmediateStrategy,
  fetchServerSentEvents,
} from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  streamProcessor: {
    chunkStrategy: new ImmediateStrategy(),
  },
});
```

## Next Steps

- [Getting Started](../getting-started/quick-start)
- [Connection Adapters](../chat/connection-adapters)
- [@tanstack/ai-react API](./ai-react)
