---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:410](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L410)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:413](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L413)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:412](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L412)

***

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:411](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L411)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
