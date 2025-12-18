---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

## Extends

- [`BaseStreamChunk`](BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

***

### id

```ts
id: string;
```

Defined in: [types.ts:659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L659)

#### Inherited from

[`BaseStreamChunk`](BaseStreamChunk.md).[`id`](BaseStreamChunk.md#id)

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

### type

```ts
type: "done";
```

Defined in: [types.ts:691](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L691)

#### Overrides

[`BaseStreamChunk`](BaseStreamChunk.md).[`type`](BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:693](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L693)

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
