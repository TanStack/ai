---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:676](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L676)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L664)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:686](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L686)

***

### model

```ts
model: string;
```

Defined in: [types.ts:665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L665)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L666)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:678](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L678)

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

Defined in: [types.ts:677](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L677)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
