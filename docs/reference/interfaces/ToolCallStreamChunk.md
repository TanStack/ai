---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:655](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L655)

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

### index

```ts
index: number;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

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

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:657](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L657)

#### function

```ts
function: object;
```

##### function.arguments

```ts
arguments: string;
```

##### function.name

```ts
name: string;
```

#### id

```ts
id: string;
```

#### type

```ts
type: "function";
```

***

### type

```ts
type: "tool_call";
```

Defined in: [types.ts:656](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L656)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
