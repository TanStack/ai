---
id: ChunkStrategy
title: ChunkStrategy
---

# Interface: ChunkStrategy

Defined in: [stream/types.ts:43](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L43)

Strategy for determining when to emit text updates

## Properties

### reset()?

```ts
optional reset: () => void;
```

Defined in: [stream/types.ts:55](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L55)

Optional: Reset strategy state (called when streaming starts)

#### Returns

`void`

***

### shouldEmit()

```ts
shouldEmit: (chunk, accumulated) => boolean;
```

Defined in: [stream/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/types.ts#L50)

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
