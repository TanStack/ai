---
id: PunctuationStrategy
title: PunctuationStrategy
---

# Class: PunctuationStrategy

Defined in: [stream/strategies.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L22)

Punctuation Strategy - emit when chunk contains punctuation
Useful for natural text flow in UI

## Implements

- [`ChunkStrategy`](../interfaces/ChunkStrategy.md)

## Constructors

### Constructor

```ts
new PunctuationStrategy(): PunctuationStrategy;
```

#### Returns

`PunctuationStrategy`

## Methods

### shouldEmit()

```ts
shouldEmit(chunk, _accumulated): boolean;
```

Defined in: [stream/strategies.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L25)

Called for each text chunk received

#### Parameters

##### chunk

`string`

The new chunk of text (delta)

##### \_accumulated

`string`

#### Returns

`boolean`

true if an update should be emitted now

#### Implementation of

[`ChunkStrategy`](../interfaces/ChunkStrategy.md).[`shouldEmit`](../interfaces/ChunkStrategy.md#shouldemit)
