---
id: ChunkStrategy
title: ChunkStrategy
---

# Interface: ChunkStrategy

Defined in: [activities/chat/stream/types.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L33)

Strategy for determining when to emit text updates

## Properties

### reset()?

```ts
optional reset: () => void;
```

Defined in: [activities/chat/stream/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L45)

Optional: Reset strategy state (called when streaming starts)

#### Returns

`void`

***

### shouldEmit()

```ts
shouldEmit: (chunk, accumulated) => boolean;
```

Defined in: [activities/chat/stream/types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L40)

Called for each text chunk received

#### Parameters

##### chunk

`string`

The new chunk of text (delta)

##### accumulated

`string`

All text accumulated so far

#### Returns

`boolean`

true if an update should be emitted now
