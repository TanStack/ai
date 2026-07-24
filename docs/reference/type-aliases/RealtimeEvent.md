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
  | "error"
  | "go_away"
  | "usage";
```

Defined in: [packages/ai/src/realtime/types.ts:243](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L243)

Events emitted by the realtime connection
