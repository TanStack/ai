---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L524)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:534](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L534)

***

### model

```ts
model: string;
```

Defined in: [types.ts:513](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L513)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L514)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L526)

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

Defined in: [types.ts:525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L525)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
