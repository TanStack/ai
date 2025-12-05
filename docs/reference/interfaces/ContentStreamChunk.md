---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:572](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L572)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:575](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L575)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:574](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L574)

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

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:576](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L576)

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
type: "content";
```

Defined in: [types.ts:573](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L573)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
