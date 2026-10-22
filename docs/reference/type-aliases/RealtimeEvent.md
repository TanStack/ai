---
id: RealtimeEvent
title: RealtimeEvent
---

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

Defined in: packages/ai/src/realtime/types.ts:243

Events emitted by the realtime connection
