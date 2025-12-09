---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [types.ts:669](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L669)

Emitted when a reasoning/thinking step starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:671](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L671)

***

### stepType

```ts
stepType: "thinking" | "reasoning" | "planning";
```

Defined in: [types.ts:672](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L672)

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
type: "STEP_STARTED";
```

Defined in: [types.ts:670](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L670)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
