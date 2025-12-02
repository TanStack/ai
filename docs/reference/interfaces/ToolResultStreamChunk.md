---
id: ToolResultStreamChunk
title: ToolResultStreamChunk
---

# Interface: ToolResultStreamChunk

Defined in: [types.ts:368](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L368)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:371](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L371)

***

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:370](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L370)

***

### type

```ts
type: "tool_result";
```

Defined in: [types.ts:369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L369)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
