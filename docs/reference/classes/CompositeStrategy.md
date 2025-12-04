---
id: CompositeStrategy
title: CompositeStrategy
---

# Class: CompositeStrategy

Defined in: [stream/strategies.ts:68](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L68)

Composite Strategy - combine multiple strategies (OR logic)
Emits if ANY strategy says to emit

## Implements

- [`ChunkStrategy`](../../interfaces/ChunkStrategy)

## Constructors

### Constructor

```ts
new CompositeStrategy(strategies): CompositeStrategy;
```

Defined in: [stream/strategies.ts:69](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L69)

#### Parameters

##### strategies

[`ChunkStrategy`](../../interfaces/ChunkStrategy)[]

#### Returns

`CompositeStrategy`

## Methods

### reset()

```ts
reset(): void;
```

Defined in: [stream/strategies.ts:75](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L75)

Optional: Reset strategy state (called when streaming starts)

#### Returns

`void`

#### Implementation of

[`ChunkStrategy`](../../interfaces/ChunkStrategy).[`reset`](../../interfaces/ChunkStrategy#reset)

***

### shouldEmit()

```ts
shouldEmit(chunk, accumulated): boolean;
```

Defined in: [stream/strategies.ts:71](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L71)

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

#### Implementation of

[`ChunkStrategy`](../../interfaces/ChunkStrategy).[`shouldEmit`](../../interfaces/ChunkStrategy#shouldemit)
