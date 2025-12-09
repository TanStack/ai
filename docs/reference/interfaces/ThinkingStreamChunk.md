---
id: ThinkingStreamChunk
title: ThinkingStreamChunk
---

# Interface: ThinkingStreamChunk

Defined in: [types.ts:591](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L591)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:594](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L594)

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:593](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L593)

***

### id

```ts
id: string;
```

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "thinking";
```

Defined in: [types.ts:592](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L592)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
