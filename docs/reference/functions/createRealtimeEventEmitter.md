---
id: createRealtimeEventEmitter
title: createRealtimeEventEmitter
---

# Function: createRealtimeEventEmitter()

```ts
function createRealtimeEventEmitter(): object;
```

Defined in: [packages/ai/src/realtime/event-emitter.ts:16](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/event-emitter.ts#L16)

## Returns

`object`

### emit()

```ts
emit<TEvent>(event, payload): void;
```

#### Type Parameters

##### TEvent

`TEvent` *extends* [`RealtimeEvent`](../type-aliases/RealtimeEvent.md)

#### Parameters

##### event

`TEvent`

##### payload

[`RealtimeEventPayloads`](../interfaces/RealtimeEventPayloads.md)\[`TEvent`\]

#### Returns

`void`

### on()

```ts
on<TEvent>(event, handler): () => void;
```

#### Type Parameters

##### TEvent

`TEvent` *extends* [`RealtimeEvent`](../type-aliases/RealtimeEvent.md)

#### Parameters

##### event

`TEvent`

##### handler

[`RealtimeEventHandler`](../type-aliases/RealtimeEventHandler.md)\<`TEvent`\>

#### Returns

```ts
(): void;
```

##### Returns

`void`
