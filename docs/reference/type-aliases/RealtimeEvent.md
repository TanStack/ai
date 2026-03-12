---
id: RealtimeEvent
title: RealtimeEvent
---

# Type Alias: RealtimeEvent

```ts
type RealtimeEvent =
  | 'status_change'
  | 'mode_change'
  | 'transcript'
  | 'audio_chunk'
  | 'tool_call'
  | 'message_complete'
  | 'interrupted'
  | 'error';
```

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Events emitted by the realtime connection. Used with `RealtimeConnection.on()` to subscribe to specific events.

| Event | Payload | Description |
|-------|---------|-------------|
| `'status_change'` | `{ status: RealtimeStatus }` | Connection status changed |
| `'mode_change'` | `{ mode: RealtimeMode }` | Session mode changed |
| `'transcript'` | `{ role, transcript, isFinal }` | Speech transcript (partial or final) |
| `'audio_chunk'` | `{ data: ArrayBuffer, sampleRate }` | Raw audio data received |
| `'tool_call'` | `{ toolCallId, toolName, input }` | Tool call requested by the model |
| `'message_complete'` | `{ message: RealtimeMessage }` | Complete message received |
| `'interrupted'` | `{ messageId?: string }` | Response was interrupted |
| `'error'` | `{ error: Error }` | Error occurred |
