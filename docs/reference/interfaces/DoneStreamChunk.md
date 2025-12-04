---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:548](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L548)

## Extends

- [`BaseStreamChunk`](../BaseStreamChunk)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:550](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L550)

***

### id

```ts
id: string;
```

Defined in: [types.ts:517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L517)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`id`](../BaseStreamChunk#id)

***

### model

```ts
model: string;
```

Defined in: [types.ts:518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L518)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`model`](../BaseStreamChunk#model)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L519)

#### Inherited from

[`BaseStreamChunk`](../BaseStreamChunk).[`timestamp`](../BaseStreamChunk#timestamp)

***

### type

```ts
type: "done";
```

Defined in: [types.ts:549](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L549)

#### Overrides

[`BaseStreamChunk`](../BaseStreamChunk).[`type`](../BaseStreamChunk#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:551](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L551)

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
