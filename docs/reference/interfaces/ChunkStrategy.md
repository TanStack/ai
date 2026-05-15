---
id: ChunkStrategy
title: ChunkStrategy
---

# Interface: ChunkStrategy

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L38)

Strategy for determining when to emit text updates

## Properties

### reset()?

```ts
optional reset: () => void;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L50)

Optional: Reset strategy state (called when streaming starts)

#### Returns

`void`

***

### shouldEmit()

```ts
shouldEmit: (chunk, accumulated) => boolean;
```

Defined in: [packages/typescript/ai/src/activities/chat/stream/types.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/stream/types.ts#L45)

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
