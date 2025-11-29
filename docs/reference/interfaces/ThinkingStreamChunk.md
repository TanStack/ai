---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L355)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L358)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L357)

***

### id

```ts
id: string;
```

Defined in: [types.ts:288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L288)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:356](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L356)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
