---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:684](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L684)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:687](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L687)

***

### id

```ts
id: string;
```

Defined in: [types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:660](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L660)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L661)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L686)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:685](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L685)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
