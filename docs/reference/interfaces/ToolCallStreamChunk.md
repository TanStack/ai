---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:579](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L579)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:567](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L567)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:589](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L589)

***

### model

```ts
model: string;
```

Defined in: [types.ts:568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L568)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`model`](BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:569](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L569)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`timestamp`](BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:581](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L581)

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

Defined in: [types.ts:580](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L580)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)
