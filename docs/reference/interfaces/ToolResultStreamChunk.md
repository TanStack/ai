---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:299](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L299)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L302)

***

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L275)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L301)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:300](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L300)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
