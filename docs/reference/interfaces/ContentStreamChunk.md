---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:572](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L572)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:571](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L571)

***

### id

```ts
id: string;
```

Defined in: [types.ts:564](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L564)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L565)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:573](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L573)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "content";
```

Defined in: [types.ts:570](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L570)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
