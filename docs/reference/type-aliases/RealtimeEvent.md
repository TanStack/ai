---
id: RealtimeEvent
title: RealtimeEvent
---

# Type Alias: RealtimeEvent

```ts
type RealtimeEvent = 
  | "status_change"
  | "mode_change"
  | "transcript"
  | "audio_chunk"
  | "tool_call"
  | "message_complete"
  | "interrupted"
  | "error";
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L238)

Events emitted by the realtime connection
