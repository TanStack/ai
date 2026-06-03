---
id: TypedStreamChunk
title: TypedStreamChunk
---

# Type Alias: TypedStreamChunk\<TTools\>

```ts
type TypedStreamChunk<
  TTools extends ReadonlyArray<Tool<any, any, any>> = ReadonlyArray<Tool<any, any, any>>,
> =
  HasTypedTools<TTools> extends true
    ?
        | Exclude<
            StreamChunk,
            | { type: 'TOOL_CALL_START' }
            | { type: 'TOOL_CALL_END' }
            | { type: 'CUSTOM' }
          >
        | DistributedToolCallStart<TTools>
        | DistributedToolCallEnd<TTools>
        | TaggedCustomEvent
    : StreamChunk;
```

Defined in: [packages/typescript/ai/src/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts)

A variant of [`StreamChunk`](./StreamChunk) parameterized by the tools array. When specific tool types are provided (e.g. from `chat({ tools: [myTool] })`):

- `TOOL_CALL_START` and `TOOL_CALL_END` events form a **discriminated union** over tool names.
- Checking `toolName === 'x'` narrows `input` to that specific tool's input type.
- `TOOL_CALL_END` events have `input` typed per-tool via Standard Schema inference.
- `CUSTOM` events with literal tagged names (`structured-output.start`, `structured-output.complete`, `approval-requested`, `tool-input-available`) narrow `value` to the corresponding payload via the [`TaggedCustomEvent`](./TaggedCustomEvent) union.

When tools are untyped or absent, `TypedStreamChunk` falls back to plain `StreamChunk` so existing consumers that pass streams as `AsyncIterable<StreamChunk>` keep working.

This is the type returned by `chat()` when streaming is enabled (the default). You don't typically need to reference it directly unless annotating function parameters or return types.

```ts
import { chat, toolDefinition, type TypedStreamChunk } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const weatherTool = toolDefinition({
  name: "get_weather",
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
});

const searchTool = toolDefinition({
  name: "search",
  description: "Search the web",
  inputSchema: z.object({ query: z.string() }),
});

// Inferred from `chat()` — typed tool call events plus tagged CUSTOM events
const stream = chat({
  adapter: openaiText("gpt-5.2"),
  messages,
  tools: [weatherTool, searchTool],
});

// Explicit annotation
type Chunk = TypedStreamChunk<[typeof weatherTool, typeof searchTool]>;
```

See [Streaming - Type-Safe Tool Call Events](../../chat/streaming) for a practical walkthrough.
