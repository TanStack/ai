---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:576](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L576)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:564](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L564)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:586](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L586)

***

### model

```ts
model: string;
```

Defined in: [types.ts:565](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L565)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:566](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L566)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:578](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L578)

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

Defined in: [types.ts:577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L577)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
