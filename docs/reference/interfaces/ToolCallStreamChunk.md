---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:286](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L286)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:296](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L296)

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

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L288)

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

Defined in: [types.ts:287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L287)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
