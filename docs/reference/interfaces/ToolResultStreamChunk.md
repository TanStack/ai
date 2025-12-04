---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:542](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L542)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L545)

***

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`model`](../BaseStreamChunk#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`timestamp`](../BaseStreamChunk#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:544](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L544)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:543](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L543)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)
