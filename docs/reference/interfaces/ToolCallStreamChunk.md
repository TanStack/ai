---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:608](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L608)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:596](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L596)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L618)

***

### model

```ts
model: string;
```

Defined in: [types.ts:597](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L597)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:598](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L598)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:610](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L610)

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

Defined in: [types.ts:609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L609)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
