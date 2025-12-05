---
id: ImmediateStrategy
title: ImmediateStrategy
---

# Class: ImmediateStrategy

Defined in: [stream/strategies.ts:12](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L12)

Immediate Strategy - emit on every chunk (default behavior)

## Implements

- [`ChunkStrategy`](../interfaces/ChunkStrategy.md)

## Constructors

### Constructor

```ts
new ImmediateStrategy(): ImmediateStrategy;
```

#### Returns

`ImmediateStrategy`

## Methods

### shouldEmit()

```ts
shouldEmit(_chunk, _accumulated): boolean;
```

Defined in: [stream/strategies.ts:13](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L13)

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
