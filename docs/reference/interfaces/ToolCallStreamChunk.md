---
id: ToolCallStreamChunk
title: ToolCallStreamChunk
---

# Interface: ToolCallStreamChunk

Defined in: [types.ts:355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L355)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

***

### index

```ts
index: number;
```

Defined in: [types.ts:365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L365)

***

### model

```ts
model: string;
```

Defined in: [types.ts:344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L344)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`model`](./BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L345)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`timestamp`](./BaseStreamChunk.md#timestamp)

***

### toolCall

```ts
toolCall: object;
```

Defined in: [types.ts:357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L357)

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

Defined in: [types.ts:356](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L356)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)
