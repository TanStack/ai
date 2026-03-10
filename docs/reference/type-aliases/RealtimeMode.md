---
id: RealtimeMode
title: RealtimeMode
---

# Type Alias: RealtimeMode

```ts
type RealtimeMode = 'idle' | 'listening' | 'thinking' | 'speaking';
```

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Current mode of the realtime session.

| Value | Description |
|-------|-------------|
| `'idle'` | Connected but not actively interacting |
| `'listening'` | Capturing user audio input |
| `'thinking'` | Processing user input |
| `'speaking'` | AI is generating a response |
