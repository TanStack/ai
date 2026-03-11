---
id: RealtimeMessagePart
title: RealtimeMessagePart
---

# Type Alias: RealtimeMessagePart

```ts
type RealtimeMessagePart =
  | RealtimeTextPart
  | RealtimeAudioPart
  | RealtimeToolCallPart
  | RealtimeToolResultPart
  | RealtimeImagePart;
```

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Union of all realtime message part types.

| Part | `type` Field | Key Properties |
|------|-------------|----------------|
| `RealtimeTextPart` | `'text'` | `content: string` |
| `RealtimeAudioPart` | `'audio'` | `transcript: string`, `durationMs?: number` |
| `RealtimeToolCallPart` | `'tool-call'` | `id`, `name`, `arguments`, `input?`, `output?` |
| `RealtimeToolResultPart` | `'tool-result'` | `toolCallId`, `content` |
| `RealtimeImagePart` | `'image'` | `data: string`, `mimeType: string` |
