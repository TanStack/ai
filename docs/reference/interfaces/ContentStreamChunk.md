---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:279](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L279)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L282)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:281](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L281)

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

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L283)

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
type: "content";
```

Defined in: [types.ts:280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L280)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
