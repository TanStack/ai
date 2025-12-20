---
id: ToolInputAvailableStreamChunk
title: ToolInputAvailableStreamChunk
---

# Interface: ToolInputAvailableStreamChunk

Defined in: [types.ts:703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L703)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:643](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L643)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### input

```ts
input: any;
```

Defined in: [types.ts:707](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L707)

***

### model

```ts
model: string;
```

Defined in: [types.ts:644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L644)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L645)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:705](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L705)

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:706](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L706)

***

### type

```ts
type: "tool-input-available";
```

Defined in: [types.ts:704](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L704)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
