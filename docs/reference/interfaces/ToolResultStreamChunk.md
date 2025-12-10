---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:621](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L621)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:624](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L624)

***

### id

```ts
id: string;
```

Defined in: [types.ts:596](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L596)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:597](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L597)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:598](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L598)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:623](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L623)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:622](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L622)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
