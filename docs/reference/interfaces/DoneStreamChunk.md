---
id: DoneStreamChunk
title: DoneStreamChunk
---

# Interface: DoneStreamChunk

Defined in: [types.ts:543](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L543)

## Extends

- [`BaseStreamChunk`](./BaseStreamChunk.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L545)

***

### id

```ts
id: string;
```

Defined in: [types.ts:512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L512)

#### Inherited from

[`BaseStreamChunk`](./BaseStreamChunk.md).[`id`](./BaseStreamChunk.md#id)

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

### type

```ts
type: "done";
```

Defined in: [types.ts:544](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L544)

#### Overrides

[`BaseStreamChunk`](./BaseStreamChunk.md).[`type`](./BaseStreamChunk.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:546](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L546)

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
