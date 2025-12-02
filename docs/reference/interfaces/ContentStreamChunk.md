---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:348](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L348)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L351)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:350](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L350)

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

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:352](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L352)

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
type: "content";
```

Defined in: [types.ts:349](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L349)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
