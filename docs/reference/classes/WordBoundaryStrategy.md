---
id: WordBoundaryStrategy
title: WordBoundaryStrategy
---

# Class: WordBoundaryStrategy

Defined in: [stream/strategies.ts:57](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L57)

Word Boundary Strategy - emit at word boundaries
Prevents cutting words in half

## Implements

- [`ChunkStrategy`](../interfaces/ChunkStrategy.md)

## Constructors

### Constructor

```ts
new WordBoundaryStrategy(): WordBoundaryStrategy;
```

#### Returns

`WordBoundaryStrategy`

## Methods

### shouldEmit()

```ts
shouldEmit(chunk, _accumulated): boolean;
```

Defined in: [stream/strategies.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/stream/strategies.ts#L58)

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
