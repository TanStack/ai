---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:549](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L549)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:552](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L552)

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

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:551](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L551)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:550](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L550)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
