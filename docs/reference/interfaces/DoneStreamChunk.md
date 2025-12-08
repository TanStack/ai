---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

***

### id

```ts
id: string;
```

Defined in: [types.ts:596](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L596)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

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

### type

```ts
type: "done";
```

Defined in: [types.ts:628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L628)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L630)

#### completionTokens

```ts
completionTokens: number;
```

#### promptTokens

```ts
promptTokens: number;
```

#### totalTokens

```ts
totalTokens: number;
```
