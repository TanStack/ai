---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:305](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L305)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:307](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L307)

***

### id

```ts
id: string;
```

Defined in: [types.ts:274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L274)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L275)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:276](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L276)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "done";
```

Defined in: [types.ts:306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L306)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L308)

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
