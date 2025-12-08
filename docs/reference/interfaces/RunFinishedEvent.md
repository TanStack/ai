---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [types.ts:574](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L574)

Emitted when a run completes successfully.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### finishReason

```ts
finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [types.ts:577](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L577)

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:576](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L576)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "RUN_FINISHED";
```

Defined in: [types.ts:575](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L575)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)

***

### usage?

```ts
optional usage: object;
```

Defined in: [types.ts:578](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L578)

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
