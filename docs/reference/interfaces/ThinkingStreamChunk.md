---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:584](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L584)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:587](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L587)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:586](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L586)

***

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`model`](../BaseStreamChunk#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`timestamp`](../BaseStreamChunk#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:585](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L585)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)
