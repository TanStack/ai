---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:671](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L671)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:681](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L681)

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

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:673](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L673)

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

Defined in: [types.ts:672](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L672)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
