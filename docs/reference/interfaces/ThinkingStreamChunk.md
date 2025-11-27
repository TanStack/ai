---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L341)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

***

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L275)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:342](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L342)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
