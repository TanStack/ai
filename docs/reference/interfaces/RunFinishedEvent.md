---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [types.ts:646](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L646)

Emitted when a run completes successfully.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:649](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L649)

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:648](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L648)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "RUN_FINISHED";
```

Defined in: [types.ts:647](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L647)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:650](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L650)

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
