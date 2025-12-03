---
id: StreamChunk
title: StreamChunk
---

# Type Alias: StreamChunk

```ts
type StreamChunk = 
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk
  | ThinkingStreamChunk;
```

Defined in: [types.ts:588](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L588)

Chunk returned by the sdk during streaming chat completions.
