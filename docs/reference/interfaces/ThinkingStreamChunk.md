---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:634](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L634)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:637](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L637)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:636](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L636)

***

### id

```ts
id: string;
```

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:635](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L635)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
