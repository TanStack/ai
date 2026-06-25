---
id: RealtimeEventHandler
title: RealtimeEventHandler
---

# Type Alias: RealtimeEventHandler()\<TEvent\>

```ts
type RealtimeEventHandler<TEvent> = (payload) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:271](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L271)

Handler type for realtime events

## Type Parameters

### TEvent

`TEvent` *extends* [`RealtimeEvent`](RealtimeEvent.md)

## Parameters

### payload

[`RealtimeEventPayloads`](../interfaces/RealtimeEventPayloads.md)\[`TEvent`\]

## Returns

`void`
