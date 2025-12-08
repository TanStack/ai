---
id: BatchStrategy
title: BatchStrategy
---

# Class: BatchStrategy

Defined in: [stream/strategies.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L34)

Batch Strategy - emit every N chunks
Useful for reducing UI update frequency

## Implements

- [`ChunkStrategy`](../interfaces/ChunkStrategy.md)

## Constructors

### Constructor

```ts
new BatchStrategy(batchSize): BatchStrategy;
```

Defined in: [stream/strategies.ts:37](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L37)

#### Parameters

##### batchSize

`number` = `5`

#### Returns

`BatchStrategy`

## Methods

### reset()

```ts
reset(): void;
```

Defined in: [stream/strategies.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L48)

Optional: Reset strategy state (called when streaming starts)

#### Returns

`void`

#### Implementation of

[`ChunkStrategy`](../interfaces/ChunkStrategy.md).[`reset`](../interfaces/ChunkStrategy.md#reset)

***

### shouldEmit()

```ts
shouldEmit(_chunk, _accumulated): boolean;
```

Defined in: [stream/strategies.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L39)

Called for each text chunk received

#### Parameters

##### \_chunk

`string`

##### \_accumulated

`string`

#### Returns

`boolean`

true if an update should be emitted now

#### Implementation of

[`ChunkStrategy`](../interfaces/ChunkStrategy.md).[`shouldEmit`](../interfaces/ChunkStrategy.md#shouldemit)
