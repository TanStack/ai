---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:669](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L669)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:672](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L672)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:671](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L671)

***

### id

```ts
id: string;
```

Defined in: [types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:673](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L673)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L666)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "content";
```

Defined in: [types.ts:670](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L670)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
