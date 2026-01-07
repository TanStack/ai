---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:731](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L731)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:734](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L734)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:733](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L733)

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
type: "thinking";
```

Defined in: [types.ts:732](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L732)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
