---
title: Custom Events Reference
id: custom-events
order: 1
description: "Send your own progress events from a tool to the UI. Read every CUSTOM event that TanStack AI emits with a plain if, with full types."
keywords:
  - tanstack ai
  - custom events
  - KnownCustomEvent
  - ChatStream
  - ag-ui protocol
  - CUSTOM event
  - stream narrowing
---

A tool runs for 20 seconds and your UI shows nothing. Or you read a `chat()` stream and get a `CUSTOM` event, and you do not know its shape.

A `CUSTOM` event carries a `name` and a `value` next to the normal chat chunks. Your server sends one with `emitCustomEvent`. Your client reads it with `onCustomEvent`. TanStack AI also sends its own `CUSTOM` events, and this page lists all of them.

## Quick setup

### 1. Emit an event from a server tool

The tool gets `emitCustomEvent` on its second argument:

```ts
// tools.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

export const importRows = toolDefinition({
  name: "importRows",
  description: "Import rows into the dataset, reporting progress as it runs",
  inputSchema: z.object({ rows: z.array(z.string()) }),
}).server(async ({ rows }, context) => {
  for (let i = 0; i < rows.length; i++) {
    context?.emitCustomEvent("my-app:progress", {
      done: i + 1,
      total: rows.length,
    });
  }
  return { imported: rows.length };
});
```

### 2. Add the tool to the server route

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { importRows } from "./tools";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages: params.messages,
    tools: [importRows],
  });
  return toServerSentEventsResponse(stream);
}
```

### 3. Read the event in the client

Pass `onCustomEvent` to `useChat`. It gets the event name, the value, and the `toolCallId` of the tool that sent it:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [progress, setProgress] = useState("");
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onCustomEvent: (name, value) => {
      if (
        name === "my-app:progress" &&
        typeof value === "object" &&
        value !== null &&
        "done" in value &&
        "total" in value
      ) {
        setProgress(`${String(value.done)} of ${String(value.total)}`);
      }
    },
  });

  return (
    <>
      <button onClick={() => sendMessage("Import rows a, b, and c")}>
        Import
      </button>
      <p>{progress}</p>
    </>
  );
}
```

Click the button. The text counts up while the tool runs.

## How it works

Every `CUSTOM` chunk has `type: "CUSTOM"`, a `name`, and a `value`. Events from your code and events from TanStack AI use the same chunk shape and travel on the same stream.

On the server, `chat()` returns the `ChatStream` type. In `ChatStream`, every built-in event has a literal `name` and a typed `value`. Check `chunk.type`, then compare `chunk.name` to a string. You do not import a guard:

```ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "sandbox.file.diff") {
    console.log(chunk.value.path, chunk.value.diff);
  } else if (
    chunk.type === "CUSTOM" &&
    chunk.name === "structured-output.complete"
  ) {
    console.log(chunk.value.object);
  }
}
```

Your own event names are not in `ChatStream`. To read them on the server, see [Read your own events on the server](#read-your-own-events-on-the-server).

## Built-in events

Each interface extends the base `CustomEvent` (`type: 'CUSTOM'` and an optional `model`) with a literal `name` and a concrete `value`. `@tanstack/ai` exports each interface and their union, `KnownCustomEvent`.

| Interface | `name` | `value` | Emitted when |
| --- | --- | --- | --- |
| `SandboxFileCustomEvent` | `sandbox.file` | `{ type: 'create' \| 'change' \| 'delete'; path: string; timestamp: number }` | For each file create, change, or delete in an active [sandbox](../sandbox/events) |
| `SandboxFileDiffEvent` | `sandbox.file.diff` | `{ path: string; diff: string }` | For each file change. Turn it on with `fileEvents: { diff: true }` |
| `FileChangedEvent` | `file.changed` | `{ path: string; diff: string }` | A harness adapter (Grok Build, Claude Code, and more), once after the run completes |
| `SessionIdEvent` | `` `${string}.session-id` `` | `{ sessionId: string }` | A harness adapter, once when it creates or resumes its session in the sandbox |
| `CodeModeExecutionStartedEvent` | `code_mode:execution_started` | `{ timestamp: number; codeLength: number }` | [Code Mode](../code-mode/code-mode), when sandbox execution starts |
| `CodeModeConsoleEvent` | `code_mode:console` | `{ level: 'log' \| 'warn' \| 'error' \| 'info'; message: string; timestamp: number }` | Code Mode, for each `console.*` call in the sandbox |
| `CodeModeExternalCallEvent` | `code_mode:external_call` | `{ function: string; args: unknown; timestamp: number }` | Code Mode, before a bound `external_*` function runs |
| `CodeModeExternalResultEvent` | `code_mode:external_result` | `{ function: string; result: unknown; duration: number }` | Code Mode, after an `external_*` call succeeds |
| `CodeModeExternalErrorEvent` | `code_mode:external_error` | `{ function: string; error: string; duration: number }` | Code Mode, when an `external_*` call throws |
| `CodeModeSnippetCallEvent` | `code_mode:snippet_call` | `{ snippet: string; input: unknown; timestamp: number }` | [Code Mode with Snippets](../code-mode/code-mode-with-snippets), before a snippet runs |
| `CodeModeSnippetResultEvent` | `code_mode:snippet_result` | `{ snippet: string; result: unknown; duration: number; timestamp: number }` | Code Mode with Snippets, after a snippet succeeds |
| `CodeModeSnippetErrorEvent` | `code_mode:snippet_error` | `{ snippet: string; error: string; duration: number; timestamp: number }` | Code Mode with Snippets, when a snippet throws |
| `SnippetRegisteredEvent` | `snippet:registered` | `{ id: string; name: string; description: string; timestamp: number }` | When a snippet goes into the tool registry |
| `StructuredOutputStartEvent` | `structured-output.start` | `{ messageId: string }` | [`chat({ outputSchema, stream: true })`](../structured-outputs/streaming), once for each structured message |
| `StructuredOutputCompleteEvent<T>` | `structured-output.complete` | `{ object: T; raw: string; reasoning?: string }` | Structured-output streaming, once with the validated object |
| `UIResourceEvent` | `ui-resource` | `{ resource; serverId?: string; toolCallId: string; toolName: string; meta?: Record<string, unknown> }` | An MCP tool returns a `ui://` resource ([MCP Apps](../mcp/apps)) |

Harness `*.session-id` events and the two `structured-output.*` events are always `CUSTOM` events. They are not fields on `RUN_FINISHED`.

Where each group of events is shown in use:

- Sandbox and harness events: [Sandbox Events](../sandbox/events) and [Observability](../sandbox/observability).
- Code Mode events: [Showing Code Mode in the UI](../code-mode/client-integration).
- Structured output events: [Streaming structured output](../structured-outputs/streaming).

## Advanced

### Emit from chat middleware

Chat middleware gets the same `emitCustomEvent` on `ChatMiddlewareContext`. The engine yields the chunk while the hook still runs. So a long `onConfig` can send `prepare` before its work is done:

```ts
import { type ChatMiddleware } from "@tanstack/ai";

async function prepare() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 1);
  });
}

const progress: ChatMiddleware = {
  name: "progress",
  async onConfig(ctx) {
    if (ctx.phase !== "beforeModel") return;
    ctx.emitCustomEvent("my-app:progress", { step: "prepare" });
    await prepare();
    ctx.emitCustomEvent("my-app:progress", { step: "ready" });
  },
};
```

### Durability and batching

With durability on the response, each `CUSTOM` event flushes when you emit it. So `prepare` reaches the client while `prepare()` still runs.

These high-volume names stay in the durability batch with later chunks:

- `process.stdout`
- `process.stderr`
- `sandbox.file`
- `sandbox.file.diff`

To keep one of your own events in the batch, pass `{ batch: true }`:

```ts
import { type ChatMiddleware } from "@tanstack/ai";

const noisy: ChatMiddleware = {
  name: "noisy",
  async onConfig(ctx) {
    ctx.emitCustomEvent("my-app:ticks", { n: 1 }, { batch: true });
  },
};
```

### Why `ChatStream` narrows

`chat()` returns `ChatStream` when you do not pass `outputSchema` and do not set `stream: false`:

```ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { ChatStream } from "@tanstack/ai";

const stream: ChatStream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello" }],
});
```

This is the definition:

```ts ignore
type ChatStream = AsyncIterable<Exclude<StreamChunk, CustomEvent> | KnownCustomEvent>
```

`StreamChunk` is the raw AG-UI event union. It has one generic `CUSTOM` member, `CustomEvent`, with `name: string` and `value: any`. With that member in the union, a check on `chunk.name` still leaves `chunk.value` typed `any`.

`ChatStream` fixes this in two steps:

1. `Exclude<StreamChunk, CustomEvent>` removes the generic member.
2. `| KnownCustomEvent` adds back each built-in event, with a literal `name` and a concrete `value`.

`StructuredOutputStream` uses the same approach.

### Read your own events on the server

`'my-app:progress'` is not a literal name in `KnownCustomEvent`, so `ChatStream` does not include it. `ChatStream` has no generic fallback member, because that member gives `value: any` to every other event.

The event still arrives at runtime. To read it with types, annotate the stream as `StreamChunk`. The generic member gives `value: any`, so you do not need a cast:

```ts ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { StreamChunk } from "@tanstack/ai";
import { importRows } from "./tools";

const stream: AsyncIterable<StreamChunk> = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Import these rows" }],
  tools: [importRows],
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "my-app:progress") {
    console.log(chunk.value.done, chunk.value.total);
  }
}
```

Use `ChatStream` to read the built-in events with full types. Use `StreamChunk` for the branches that read your own events.

For the standard AG-UI events that this union extends, see [Stream Events](../chat/stream-events). For the `metadata.tanstack` fields a custom server sends, see [Event metadata](./metadata).
