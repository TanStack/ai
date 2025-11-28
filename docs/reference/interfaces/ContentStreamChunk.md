---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:294](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L294)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:297](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L297)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L296)

***

### id

```ts
id: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:298](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L298)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "content";
```

Defined in: [types.ts:295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L295)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
