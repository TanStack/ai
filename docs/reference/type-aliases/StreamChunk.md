---
id: StreamChunk
title: StreamChunk
---

# Type Alias: StreamChunk

```ts
type StreamChunk = AGUIEvent;
```

Defined in: [packages/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1667)

Chunk returned by the SDK during streaming chat completions.
Uses the AG-UI protocol event format.

For the tool-aware variant that narrows `TOOL_CALL_START`/`TOOL_CALL_END` events by tool name and `CUSTOM` events by tagged literal name, see [`TypedStreamChunk`](./TypedStreamChunk).
