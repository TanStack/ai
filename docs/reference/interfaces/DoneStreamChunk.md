---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L319)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:321](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L321)

***

### id

```ts
id: string;
```

Defined in: [types.ts:288](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L288)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`id`](../BaseStreamChunk.md#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L289)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`model`](../BaseStreamChunk.md#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L290)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk.md).[`timestamp`](../BaseStreamChunk.md#timestamp)

***

### type

```ts
type: "done";
```

Defined in: [types.ts:320](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L320)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk.md).[`type`](../BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:322](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L322)

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
