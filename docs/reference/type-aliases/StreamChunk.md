---
id: StreamChunk
title: StreamChunk
---

# Type Alias: StreamChunk

```ts
type StreamChunk = AGUIEvent;
```

Defined in: [types.ts:990](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L990)

Chunk returned by the SDK during streaming chat completions.
Uses the AG-UI protocol event format.

# Type Alias: TypedStreamChunk

```ts
type TypedStreamChunk<TTools extends ReadonlyArray<Tool<any, any, any>> = ReadonlyArray<Tool<any, any, any>>>
```

Defined in: [types.ts:1065](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1065)

A variant of `StreamChunk` parameterized by the tools array. When specific tool types are provided (e.g. from `chat({ tools: [myTool] })`):

- `TOOL_CALL_START` and `TOOL_CALL_END` events form a **discriminated union** over tool names.
- Checking `toolName === 'x'` narrows `input` to that specific tool's input type.
- `TOOL_CALL_END` events have `input` typed per-tool via Standard Schema inference.

When tools are untyped or absent, `TypedStreamChunk` degrades to the same type as `StreamChunk`.

This is the type returned by `chat()` when streaming is enabled (the default). You don't typically need to reference it directly unless annotating function parameters or return types.

```ts
import type { TypedStreamChunk } from "@tanstack/ai";
import { toolDefinition } from "@tanstack/ai";

// Given tools created with toolDefinition():
const weatherTool = toolDefinition({ name: "get_weather", description: "...", inputSchema: /* Zod schema */ });
const searchTool = toolDefinition({ name: "search", description: "...", inputSchema: /* Zod schema */ });

// Without type args — equivalent to StreamChunk
type Chunk = TypedStreamChunk;

// With specific tools — tool call events are typed
type TypedChunk = TypedStreamChunk<[typeof weatherTool, typeof searchTool]>;
```

See [Streaming - Type-Safe Tool Call Events](../../chat/streaming) for a practical walkthrough.
