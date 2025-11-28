---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L301)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:311](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L311)

***

### model

```ts
model: string;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:291](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L291)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:303](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L303)

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

Defined in: [types.ts:302](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L302)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)
