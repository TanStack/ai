---
id: ContentStreamChunk
title: ContentStreamChunk
---

# Interface: ContentStreamChunk

Defined in: [types.ts:522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L522)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

***

### delta

```ts
delta: string;
```

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)

***

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "content";
```

Defined in: [types.ts:523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L523)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
