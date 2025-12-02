---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L374)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:376](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L376)

***

### id

```ts
id: string;
```

Defined in: [types.ts:343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L343)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

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

### type

```ts
type: "done";
```

Defined in: [types.ts:375](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L375)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:377](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L377)

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
