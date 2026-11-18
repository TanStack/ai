---
id: RealtimeEventHandler
title: RealtimeEventHandler
---

```ts
type RealtimeEventHandler<TEvent> = (payload) => void;
```

Defined in: [packages/ai/src/realtime/types.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L287)

Handler type for realtime events

## Type Parameters

### TEvent

`TEvent` *extends* [`RealtimeEvent`](RealtimeEvent.md)

## Parameters

### payload

[`RealtimeEventPayloads`](../interfaces/RealtimeEventPayloads.md)\[`TEvent`\]

## Returns

`void`
