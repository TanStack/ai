---
id: RealtimeStatus
title: RealtimeStatus
---

# Type Alias: RealtimeStatus

```ts
type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
```

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Connection status of the realtime client.

| Value | Description |
|-------|-------------|
| `'idle'` | Not connected |
| `'connecting'` | Establishing connection |
| `'connected'` | Active session |
| `'reconnecting'` | Reconnecting after interruption |
| `'error'` | Connection error occurred |
